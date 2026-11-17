/**
 * Print-job nonces without emulators: self-authenticating (random + MAC), forged / altered values rejected with no
 * Firestore access at all, the key sources (PRINT_JOB_SECRET → service account → emulator constant → none = fail
 * closed, with PrintKeyMissingError and the reason) and the limits of the public print page (per nonce, never per
 * client address: our own Chromium renders every PDF from one address).
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ db: vi.fn(), emulator: false }));
const reportData = vi.hoisted(() => ({ loadReportForJob: vi.fn() }));

vi.mock("../firebase-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../firebase-admin")>()),
  db: admin.db,
  isEmulatorMode: () => admin.emulator,
}));

// Every request of the page comes from one client address: the egress IP of the server whose Chromium prints.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7" }),
}));

vi.mock("../mail/report-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mail/report-data")>()),
  loadReportForJob: reportData.loadReportForJob,
}));

const {
  deletePrintJob,
  isPrintNonce,
  newPrintNonce,
  PRINT_JOB_SECRET_MIN_LENGTH,
  PRINT_KEY_MISSING,
  PRINT_KEY_TOO_SHORT,
  PRINT_NONCE_RATE,
  PrintKeyMissingError,
  printJobDoc,
  printKeyMaterial,
  readPrintJob,
  readPrintJobForPage,
} = await import("../mail/print-jobs");
const { PRINT_KEY_WARNING, printKeyProblem } = await import("../mail/print-key");
const { mailStatus } = await import("../mail/transport");
const { sendWithoutPdf } = await import("../mail/report-job");
const { REPORT_PDF_MAX_ATTEMPTS } = await import("../../constants");
const { resetRateLimits } = await import("../rate-limit");
const { default: ReportPrintPage, generateMetadata } = await import("@/app/in/bao-cao/[job]/page");

const SECRET = "s".repeat(PRINT_JOB_SECRET_MIN_LENGTH);
const SPEC = { levelId: "THCS", mode: "week", key: "2026-10-19", to: "khoi-6", detail: true, addressee: "Tổ khối 6", viewerUid: "u1", preparedBy: "A" } as const;

/** Only these key sources (the test shell may have others). */
function useEnv(env: { PRINT_JOB_SECRET?: string; FIREBASE_SERVICE_ACCOUNT_BASE64?: string; FIREBASE_PRIVATE_KEY?: string }) {
  vi.stubEnv("PRINT_JOB_SECRET", env.PRINT_JOB_SECRET ?? "");
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_BASE64", env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? "");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", env.FIREBASE_PRIVATE_KEY ?? "");
}

const flip = (nonce: string, i: number) => `${nonce.slice(0, i)}${nonce[i] === "0" ? "1" : "0"}${nonce.slice(i + 1)}`;

beforeEach(() => {
  admin.db.mockReset();
  admin.db.mockImplementation(() => {
    throw new Error("Firestore must not be touched");
  });
  admin.emulator = false;
  useEnv({ PRINT_JOB_SECRET: SECRET });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("print nonces", () => {
  it("are 64 lower-case hex characters, different every time, and verify", () => {
    const a = newPrintNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newPrintNonce()).not.toBe(a);
    expect(isPrintNonce(a)).toBe(true);
    expect(isPrintNonce(a.toUpperCase())).toBe(false);
  });

  it("reject random, constant and altered values (one flipped character anywhere)", () => {
    const valid = newPrintNonce();
    expect(isPrintNonce(randomBytes(32).toString("hex"))).toBe(false);
    expect(isPrintNonce("0".repeat(64))).toBe(false);
    for (const i of [0, 15, 31, 32, 47, 63]) expect(isPrintNonce(flip(valid, i)), `position ${i}`).toBe(false);
    // Random part of one valid nonce + tag of another.
    const other = newPrintNonce();
    expect(isPrintNonce(`${valid.slice(0, 32)}${other.slice(32)}`)).toBe(false);
  });

  it("a forged nonce is rejected without any Firestore access (read and delete)", async () => {
    const forged = randomBytes(32).toString("hex");
    expect(await readPrintJob(forged)).toBeNull();
    expect(await readPrintJob(flip(newPrintNonce(), 63))).toBeNull();
    expect(await readPrintJob("../users/admin")).toBeNull();
    await deletePrintJob(forged);
    expect(admin.db).not.toHaveBeenCalled();
  });

  it("a valid nonce is looked up", async () => {
    const nonce = newPrintNonce();
    const doc = vi.fn((id: string) => ({ get: async () => ({ exists: id === nonce, data: () => printJobDoc(SPEC) }) }));
    admin.db.mockImplementation(() => ({ collection: () => ({ doc }) }));
    expect((await readPrintJob(nonce))?.spec).toEqual(SPEC);
    expect(doc).toHaveBeenCalledWith(nonce);
  });

  it("the key is the same for the same environment (every instance) and differs between keys", () => {
    const nonce = newPrintNonce();
    useEnv({ PRINT_JOB_SECRET: SECRET });
    expect(isPrintNonce(nonce)).toBe(true);
    useEnv({ PRINT_JOB_SECRET: "t".repeat(PRINT_JOB_SECRET_MIN_LENGTH) });
    expect(isPrintNonce(nonce)).toBe(false);
    useEnv({ FIREBASE_SERVICE_ACCOUNT_BASE64: "eyJhIjoxfQ==" });
    const fromServiceAccount = newPrintNonce();
    expect(isPrintNonce(fromServiceAccount)).toBe(true);
    useEnv({ FIREBASE_PRIVATE_KEY: "eyJhIjoxfQ==" });
    expect(isPrintNonce(fromServiceAccount)).toBe(false); // each source has its own prefix
  });

  it("key sources: PRINT_JOB_SECRET → service account (base64, then private key) → emulator constant → none", () => {
    const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;
    const sa = "eyJ0eXBlIjoic2VydmljZV9hY2NvdW50In0=";
    const pk = "-----BEGIN PRIVATE KEY-----\\nMIIE\\n-----END PRIVATE KEY-----\\n";
    expect(printKeyMaterial(env({ PRINT_JOB_SECRET: ` ${SECRET} `, FIREBASE_SERVICE_ACCOUNT_BASE64: sa }), false)).toBe(`secret:${SECRET}`);
    expect(printKeyMaterial(env({ FIREBASE_SERVICE_ACCOUNT_BASE64: sa, FIREBASE_PRIVATE_KEY: pk }), false)).toBe(`service-account:${sa}`);
    expect(printKeyMaterial(env({ FIREBASE_PRIVATE_KEY: pk }), false)).toBe(`private-key:${pk}`);
    expect(printKeyMaterial(env({}), true)).toMatch(/^emulator:/);
    expect(printKeyMaterial(env({ FIREBASE_PRIVATE_KEY: pk }), true)).toBe(`private-key:${pk}`);
    expect(printKeyMaterial(env({}), false)).toBeUndefined();
    // A too short secret is a misconfiguration: fail closed rather than use a weak key.
    expect(printKeyMaterial(env({ PRINT_JOB_SECRET: "short", FIREBASE_SERVICE_ACCOUNT_BASE64: sa }), false)).toBeUndefined();
  });

  it("without a key (production, nothing configured): no nonce is issued and none is accepted", async () => {
    const valid = newPrintNonce();
    useEnv({});
    expect(() => newPrintNonce()).toThrow(PRINT_KEY_MISSING);
    expect(isPrintNonce(valid)).toBe(false);
    expect(await readPrintJob(valid)).toBeNull();
    expect(admin.db).not.toHaveBeenCalled();
    admin.emulator = true;
    expect(isPrintNonce(newPrintNonce())).toBe(true);
  });
});

describe("missing or too short print-job key", () => {
  const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;

  it("PrintKeyMissingError with a distinct message per cause – never the value of the secret", () => {
    useEnv({});
    const missing = (() => {
      try {
        newPrintNonce();
      } catch (e) {
        return e;
      }
    })();
    expect(missing).toBeInstanceOf(PrintKeyMissingError);
    expect(missing).toMatchObject({ problem: "missing", message: PRINT_KEY_MISSING });

    const short = "kh0ng-du-dai-16c";
    useEnv({ PRINT_JOB_SECRET: short, FIREBASE_SERVICE_ACCOUNT_BASE64: "eyJhIjoxfQ==" });
    const tooShort = (() => {
      try {
        newPrintNonce();
      } catch (e) {
        return e;
      }
    })();
    expect(tooShort).toBeInstanceOf(PrintKeyMissingError);
    expect(tooShort).toMatchObject({ problem: "too-short", message: PRINT_KEY_TOO_SHORT });
    expect(PRINT_KEY_TOO_SHORT).toContain("PRINT_JOB_SECRET is set but shorter than 32 characters");
    expect((tooShort as Error).message).not.toContain(short);
    expect(PRINT_KEY_TOO_SHORT).not.toBe(PRINT_KEY_MISSING);
  });

  it("printKeyProblem: none with a key, `too-short` for a short secret (even with a service account), else `missing`", () => {
    const sa = "eyJ0eXBlIjoic2VydmljZV9hY2NvdW50In0=";
    expect(printKeyProblem(env({ PRINT_JOB_SECRET: SECRET }), false)).toBeUndefined();
    expect(printKeyProblem(env({ FIREBASE_SERVICE_ACCOUNT_BASE64: sa }), false)).toBeUndefined();
    expect(printKeyProblem(env({}), true)).toBeUndefined();
    expect(printKeyProblem(env({ PRINT_JOB_SECRET: "short", FIREBASE_SERVICE_ACCOUNT_BASE64: sa }), false)).toBe("too-short");
    expect(printKeyProblem(env({ PRINT_JOB_SECRET: "short" }), true)).toBe("too-short");
    expect(printKeyProblem(env({}), false)).toBe("missing");
    expect(printKeyProblem(env({ PRINT_JOB_SECRET: "   " }), false)).toBe("missing");
  });

  it("is permanent for a report email: sent without the PDF on the first attempt", () => {
    expect(sendWithoutPdf(1, new PrintKeyMissingError("too-short"))).toBe(true);
    expect(sendWithoutPdf(1, new PrintKeyMissingError("missing"))).toBe(true);
    expect(sendWithoutPdf(1, new Error("print page answered HTTP 500"))).toBe(false);
    expect(sendWithoutPdf(REPORT_PDF_MAX_ATTEMPTS, new Error("print page answered HTTP 500"))).toBe(true);
  });

  it("mailStatus reports it (pdfWarning, Vietnamese, no secret); absent when a key is available", () => {
    const sa = "eyJ0eXBlIjoic2VydmljZV9hY2NvdW50In0=";
    expect(mailStatus(undefined, [], env({ FIREBASE_SERVICE_ACCOUNT_BASE64: sa })).pdfWarning).toBeUndefined();
    expect(mailStatus(undefined, [], env({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" })).pdfWarning).toBeUndefined();
    expect(mailStatus(undefined, [], env({})).pdfWarning).toBe(PRINT_KEY_WARNING.missing);
    const short = mailStatus(undefined, [], env({ PRINT_JOB_SECRET: "ngan-qua-16-ky-t", FIREBASE_SERVICE_ACCOUNT_BASE64: sa }));
    expect(short.pdfWarning).toBe(PRINT_KEY_WARNING["too-short"]);
    expect(short.pdfWarning).toContain("PRINT_JOB_SECRET ngắn hơn 32 ký tự");
    expect(JSON.stringify(short)).not.toContain("ngan-qua-16-ky-t");
    expect(JSON.stringify(short)).not.toContain(sa);
  });
});

describe("print page limits", () => {
  const SPEC_REPORT = { levelId: "THCS", periodLabel: "Tuần 10 (19/10 – 25/10/2026)", scopeLabel: "Khối 6" };

  beforeEach(() => {
    resetRateLimits();
    reportData.loadReportForJob.mockReset();
    reportData.loadReportForJob.mockImplementation(async () => ({
      ok: true,
      data: { report: SPEC_REPORT, plan: { items: [] }, detail: false, topRatio: 0.9, today: "2026-11-17", preparedBy: "A" },
    }));
  });
  afterEach(() => resetRateLimits());

  /** Firestore double holding live print jobs for `nonces`; counts document reads. */
  function storeOf(nonces: readonly string[]) {
    const live = new Set(nonces);
    const reads: string[] = [];
    const doc = (id: string) => ({
      get: async () => {
        reads.push(id);
        return { exists: live.has(id), data: () => printJobDoc(SPEC) };
      },
    });
    admin.db.mockImplementation(() => ({ collection: () => ({ doc }) }));
    return reads;
  }

  it("more than 60 renders within one minute – all from the server's one address – are all served", async () => {
    const nonces = Array.from({ length: 100 }, () => newPrintNonce());
    const reads = storeOf(nonces);
    for (const nonce of nonces) {
      const meta = await generateMetadata({ params: Promise.resolve({ job: nonce }) });
      expect(meta.title, nonce).toEqual({ absolute: expect.stringContaining("NSHM_Bao-cao_THCS") });
    }
    expect(reads).toHaveLength(100);
    expect(reportData.loadReportForJob).toHaveBeenCalledTimes(100);
  });

  it("forged or malformed nonces cost no Firestore read and never reach the limiter or the report data", async () => {
    const reads = storeOf([]);
    for (let i = 0; i < 200; i++) {
      const forged = randomBytes(32).toString("hex");
      expect(await readPrintJobForPage(forged)).toBeNull();
    }
    const page = await ReportPrintPage({ params: Promise.resolve({ job: flip(newPrintNonce(), 40) }) }).catch((e: unknown) => e);
    expect((page as { digest?: string }).digest).toContain("404");
    expect(reads).toEqual([]);
    expect(admin.db).not.toHaveBeenCalled();
    expect(reportData.loadReportForJob).not.toHaveBeenCalled();
    // The flood of forged values did not use up anything a valid nonce needs.
    const valid = newPrintNonce();
    storeOf([valid]);
    expect((await readPrintJobForPage(valid))?.spec).toEqual(SPEC);
  });

  it(`a valid nonce is served at most ${PRINT_NONCE_RATE.limit} times (replays of a leaked nonce cannot burn reads)`, async () => {
    const nonce = newPrintNonce();
    const reads = storeOf([nonce]);
    const now = Date.parse("2026-11-17T03:00:00.000Z");
    for (let i = 0; i < PRINT_NONCE_RATE.limit; i++) expect(await readPrintJobForPage(nonce, now + i)).not.toBeNull();
    expect(await readPrintJobForPage(nonce, now + PRINT_NONCE_RATE.limit)).toBeNull();
    expect(reads).toHaveLength(PRINT_NONCE_RATE.limit);
    // Other nonces are unaffected.
    const other = newPrintNonce();
    storeOf([other]);
    expect(await readPrintJobForPage(other, now + PRINT_NONCE_RATE.limit)).not.toBeNull();
  });
});
