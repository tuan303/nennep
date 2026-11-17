/**
 * Mail foundation (no emulators needed): app base URL fallbacks, transport selection from the environment, the
 * unconfigured transport and mailStatus (env passed explicitly; fake values only).
 */
import { afterEach, describe, expect, it } from "vitest";
import { appBaseUrl, normalizeBaseUrl } from "../mail/base-url";
import { PRINT_KEY_WARNING } from "../mail/print-key";
import { MAIL_REQUIRED_ENV, mailStatus, mailTransport, setMailTransportForTests } from "../mail/transport";
import { MailSendError, type MailTransport, type OutgoingMail } from "../mail/types";

const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;
const FULL = env({
  MS_GRAPH_TENANT_ID: "tenant-test",
  MS_GRAPH_CLIENT_ID: "client-test",
  MS_GRAPH_CLIENT_SECRET: "secret-test",
  MAIL_SENDER: " NenNep@Example.edu.vn ",
});
const MAIL: OutgoingMail = { to: ["gv.6a01@example.edu.vn"], cc: [], subject: "Thử", html: "<p>Thử</p>" };

describe("appBaseUrl", () => {
  it("prefers APP_BASE_URL, then the Vercel production host, then the request origin, then localhost", () => {
    const origin = "https://preview.example.test";
    expect(appBaseUrl(origin, env({ APP_BASE_URL: "https://nennep.example.edu.vn/", VERCEL_PROJECT_PRODUCTION_URL: "app.example.test" }))).toBe(
      "https://nennep.example.edu.vn",
    );
    expect(appBaseUrl(origin, env({ VERCEL_PROJECT_PRODUCTION_URL: "app.example.test" }))).toBe("https://app.example.test");
    expect(appBaseUrl(origin, env({}))).toBe(origin);
    expect(appBaseUrl(undefined, env({}))).toBe("http://localhost:3000");
  });

  it("skips blank or non-http values and strips trailing slashes", () => {
    expect(appBaseUrl("http://localhost:3000/", env({ APP_BASE_URL: "  ", VERCEL_PROJECT_PRODUCTION_URL: "" }))).toBe("http://localhost:3000");
    expect(appBaseUrl(undefined, env({ APP_BASE_URL: "ftp://example.test" }))).toBe("http://localhost:3000");
    expect(normalizeBaseUrl("https://example.test/nen-nep//")).toBe("https://example.test/nen-nep");
    expect(normalizeBaseUrl("example.test")).toBe("https://example.test");
    expect(normalizeBaseUrl("http://[bad")).toBeUndefined();
    expect(normalizeBaseUrl(undefined)).toBeUndefined();
  });
});

describe("mailTransport", () => {
  afterEach(() => setMailTransportForTests(null));

  it("is unconfigured when a required variable is missing; send throws a non-retryable MailSendError", async () => {
    const t = mailTransport(env({ MS_GRAPH_TENANT_ID: "tenant-test", MAIL_SENDER: "nennep@example.edu.vn" }));
    expect(t.configured).toBe(false);
    const err = await t.send(MAIL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailSendError);
    expect((err as MailSendError).retryable).toBe(false);
    expect((err as MailSendError).message).toBe(
      "Chưa cấu hình gửi email: cần đặt biến môi trường MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET trên máy chủ.",
    );
  });

  it("is configured (Graph, loaded lazily) when every required variable is set", () => {
    const t = mailTransport(FULL);
    expect(t.configured).toBe(true);
    expect(t.sender).toBe("nennep@example.edu.vn");
  });

  it("treats an invalid MAIL_SENDER as missing", () => {
    expect(mailTransport(env({ ...FULL, MAIL_SENDER: "khong-hop-le" })).configured).toBe(false);
  });

  it("can be replaced in tests", () => {
    const fake: MailTransport = { configured: true, sender: "nennep@example.edu.vn", send: async () => undefined };
    setMailTransportForTests(fake);
    expect(mailTransport(env({}))).toBe(fake);
    setMailTransportForTests(null);
    expect(mailTransport(env({})).configured).toBe(false);
  });
});

describe("mailStatus", () => {
  afterEach(() => setMailTransportForTests(null));

  it("lists the missing variable names (never values) and the default sender name; no print-job key → pdfWarning", () => {
    const s = mailStatus("https://app.example.test", [], env({}));
    expect(s).toEqual({
      configured: false,
      senderName: "Nền nếp NSHM",
      allowedDomains: [],
      baseUrl: "https://app.example.test",
      missing: [...MAIL_REQUIRED_ENV],
      pdfWarning: PRINT_KEY_WARNING.missing,
    });
  });

  it("configured: sender, sender name, effective domains (settings list or the sender's domain)", () => {
    const serviceAccount = "eyJ0eXBlIjoic2VydmljZV9hY2NvdW50In0=";
    const deployed = env({ ...FULL, FIREBASE_SERVICE_ACCOUNT_BASE64: serviceAccount, MAIL_SENDER_NAME: "Phòng Nền nếp", APP_BASE_URL: "https://nennep.example.edu.vn" });
    const s = mailStatus(undefined, [], deployed);
    expect(s).toEqual({
      configured: true,
      sender: "nennep@example.edu.vn",
      senderName: "Phòng Nền nếp",
      allowedDomains: ["example.edu.vn"],
      baseUrl: "https://nennep.example.edu.vn",
      missing: [],
    });
    expect(mailStatus(undefined, ["Partner.example.com"], FULL).allowedDomains).toEqual(["partner.example.com"]);
    expect(JSON.stringify(mailStatus(undefined, [], FULL))).not.toContain("secret-test");
    expect(JSON.stringify(s)).not.toContain(serviceAccount);
  });

  it("shows the sender even when another variable is missing", () => {
    const s = mailStatus(undefined, [], env({ MAIL_SENDER: "nennep@example.edu.vn" }));
    expect(s.configured).toBe(false);
    expect(s.sender).toBe("nennep@example.edu.vn");
    expect(s.allowedDomains).toEqual(["example.edu.vn"]);
    expect(s.missing).toEqual(["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET"]);
  });

  it("uses the test transport", () => {
    setMailTransportForTests({ configured: true, sender: "nennep@example.edu.vn", send: async () => undefined });
    expect(mailStatus(undefined, [], env({}))).toMatchObject({ configured: true, sender: "nennep@example.edu.vn", missing: [] });
  });
});
