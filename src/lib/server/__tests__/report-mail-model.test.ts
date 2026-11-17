/**
 * Report email / PDF building blocks without emulators: calendar check, recipients of each message (domains, CC,
 * limits), batch progress + stall detection, dialog defaults, print jobs, the Chromium request filter and launch plan,
 * the download header, and the print view rendered on the server from plain (serialisable) props.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPeriodReport, recipientOptions } from "@/components/report/lib/report-model";
import { ReportPrintView } from "@/components/report/print/report-print-view";
import { REPORT_DOC_ATTR } from "@/components/report/report-print";
import { MAIL_MAX_RECIPIENTS } from "../../constants";
import type { MailStatus } from "../../contract";
import { FIXTURE_TODAY, makeFixtureDataset } from "../../engine/__fixtures__/dataset";
import type { ClassInfo, MailJob, MailJobStatus, ReportJobPayload, SchoolWeek } from "../../types";
import { ApiError } from "../errors";
import {
  chromeLaunchPlan,
  isAllowedPrintRequest,
  MAC_CHROME_PATH,
  PDF_PAGE_TIMEOUT_MS,
  pdfStepTimeout,
  printPageUrl,
  WINDOWS_CHROME_PATH,
} from "../mail/pdf";
import { isPrintJobLive, isPrintNonce, newPrintNonce, PRINT_JOB_TTL_MS, printJobDoc, type PrintJobSpec } from "../mail/print-jobs";
import { periodInCalendar } from "../mail/report-data";
import { pdfAttachmentDisposition } from "../mail/report-pdf";
import { buildReportMailRecipients } from "../mail/report-recipients";
import { OutOfTimeError } from "../mail/types";
import { BATCH_STALL_MS, batchNeedsDrain, batchView, planReportTargets } from "../mail/report-send";

const DOMAINS = ["example.edu.vn"];
const NOW = Date.parse("2026-10-21T03:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function thrown(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("expected an ApiError");
}

describe("periodInCalendar", () => {
  const weeks: Pick<SchoolWeek, "weekStart" | "month">[] = [
    { weekStart: "2026-10-12", month: "2026-10" },
    { weekStart: "2026-10-19", month: "2026-10" },
  ];
  it("needs the Monday (week) or a week of the month (month) in the calendar", () => {
    expect(periodInCalendar({ mode: "week", key: "2026-10-19" }, weeks)).toBe(true);
    expect(periodInCalendar({ mode: "week", key: "2026-10-26" }, weeks)).toBe(false);
    expect(periodInCalendar({ mode: "month", key: "2026-10" }, weeks)).toBe(true);
    expect(periodInCalendar({ mode: "month", key: "2026-11" }, weeks)).toBe(false);
  });
});

describe("planReportTargets", () => {
  const target = (to: string, recipients: string[], addressee = to) => ({ to, addressee, recipients });

  it("400 listing every address outside the allowed domains (the caller's own address included)", () => {
    const err = thrown(() =>
      planReportTargets([target("bgh", ["bgh@example.edu.vn", "x@gmail.example"]), target("khoi-6", ["y@other.example", "x@gmail.example"])], {
        domains: DOMAINS,
        settingsCc: [],
        selfCc: "Me@Outside.example",
      }),
    );
    expect(err.status).toBe(400);
    expect(err.message).toBe(
      "Các địa chỉ sau không thuộc tên miền được phép (Cài đặt → Email) nên không gửi được: x@gmail.example, y@other.example, me@outside.example.",
    );
    expect(err.details).toEqual({ blocked: ["x@gmail.example", "y@other.example", "me@outside.example"] });
  });

  it("cc = allowed settings CC ∪ the caller (normalised), never repeating a To address", () => {
    const planned = planReportTargets([target("bgh", ["bgh@example.edu.vn"], "Ban Giám hiệu"), target("khoi-6", ["cc@example.edu.vn", "gv6@example.edu.vn"], "Tổ khối 6")], {
      domains: DOMAINS,
      settingsCc: ["cc@example.edu.vn", "old@gone.example"],
      selfCc: " Admin@Example.EDU.vn ",
    });
    expect(planned).toEqual([
      { to: "bgh", addressee: "Ban Giám hiệu", recipients: ["bgh@example.edu.vn"], cc: ["cc@example.edu.vn", "admin@example.edu.vn"] },
      { to: "khoi-6", addressee: "Tổ khối 6", recipients: ["cc@example.edu.vn", "gv6@example.edu.vn"], cc: ["admin@example.edu.vn"] },
    ]);
  });

  it(`400 when one message would exceed ${MAIL_MAX_RECIPIENTS} addresses with its CC`, () => {
    const many = Array.from({ length: MAIL_MAX_RECIPIENTS }, (_, i) => `gv${i}@example.edu.vn`);
    expect(planReportTargets([target("khoi-6", many)], { domains: DOMAINS, settingsCc: [] })[0].recipients).toHaveLength(MAIL_MAX_RECIPIENTS);
    const err = thrown(() => planReportTargets([target("khoi-6", many, "Tổ khối 6")], { domains: DOMAINS, settingsCc: ["cc@example.edu.vn"] }));
    expect(err.status).toBe(400);
    expect(err.message).toBe(`Thư gửi Tổ khối 6 có quá ${MAIL_MAX_RECIPIENTS} người nhận (kể cả người nhận bản sao).`);
  });
});

/* ---------------------------------- batch --------------------------------- */

const payload = (addressee: string): ReportJobPayload => ({ mode: "week", key: "2026-10-19", to: "bgh", detail: false, addressee, viewerUid: "u1", preparedBy: "A" });

function job(over: Partial<MailJob> & { id: string; status: MailJobStatus }): MailJob {
  return {
    levelId: "THCS",
    kind: "REPORT",
    to: ["bgh@example.edu.vn"],
    cc: [],
    payload: payload("Ban Giám hiệu"),
    batchId: "batch-0001",
    attempts: 0,
    nextAttemptAt: iso(NOW - 60_000),
    createdAt: iso(NOW - 60_000),
    createdBy: "u1",
    createdByName: "A",
    ...over,
  };
}

describe("batchView", () => {
  it("items in send order with addressee / error / sentAt, counts per status, done when nothing is pending or sending", () => {
    const view = batchView("batch-0001", [
      job({ id: "9_b", status: "SENT", createdAt: iso(NOW - 2), sentAt: iso(NOW), payload: payload("Tổ khối 6") }),
      job({ id: "9_a", status: "FAILED", createdAt: iso(NOW - 3), lastError: "Lỗi thử", payload: payload("Ban Giám hiệu") }),
      job({ id: "8_c", status: "SKIPPED", createdAt: iso(NOW - 1), skipReason: "Bỏ qua", payload: payload("GVCN lớp 6A01") }),
    ]);
    expect(view.items).toEqual([
      { id: "9_a", to: ["bgh@example.edu.vn"], addressee: "Ban Giám hiệu", status: "FAILED", lastError: "Lỗi thử" },
      { id: "9_b", to: ["bgh@example.edu.vn"], addressee: "Tổ khối 6", status: "SENT", sentAt: iso(NOW) },
      { id: "8_c", to: ["bgh@example.edu.vn"], addressee: "GVCN lớp 6A01", status: "SKIPPED", skipReason: "Bỏ qua" },
    ]);
    expect(view.counts).toEqual({ PENDING: 0, SENDING: 0, SENT: 1, FAILED: 1, SKIPPED: 1 });
    expect(view.done).toBe(true);
    expect(batchView("b", [job({ id: "1", status: "PENDING" })]).done).toBe(false);
    expect(batchView("b", [job({ id: "1", status: "SENDING" })]).done).toBe(false);
  });
});

describe("batchNeedsDrain", () => {
  const old = NOW - BATCH_STALL_MS - 1_000;
  it("a due PENDING job and no activity for 20 s → drain again", () => {
    expect(batchNeedsDrain([job({ id: "1", status: "PENDING", createdAt: iso(old), nextAttemptAt: iso(old) })], NOW)).toBe(true);
  });
  it("not while the batch is fresh, a job is SENDING under its lease, or a job was just sent", () => {
    expect(batchNeedsDrain([job({ id: "1", status: "PENDING", createdAt: iso(NOW - 5_000), nextAttemptAt: iso(NOW - 5_000) })], NOW)).toBe(false);
    const pending = job({ id: "1", status: "PENDING", createdAt: iso(old), nextAttemptAt: iso(old) });
    expect(batchNeedsDrain([pending, job({ id: "2", status: "SENDING", createdAt: iso(old), leaseUntil: iso(NOW + 60_000) })], NOW)).toBe(false);
    expect(batchNeedsDrain([pending, job({ id: "2", status: "SENT", createdAt: iso(old), sentAt: iso(NOW - 3_000) })], NOW)).toBe(false);
  });
  it("not for jobs backing off or finished; yes for a SENDING job whose lease expired", () => {
    expect(batchNeedsDrain([job({ id: "1", status: "PENDING", createdAt: iso(old), nextAttemptAt: iso(NOW + 60_000) })], NOW)).toBe(false);
    expect(batchNeedsDrain([job({ id: "1", status: "SENT", createdAt: iso(old), sentAt: iso(old) }), job({ id: "2", status: "FAILED", createdAt: iso(old) })], NOW)).toBe(false);
    expect(batchNeedsDrain([job({ id: "1", status: "SENDING", createdAt: iso(old - 300_000), leaseUntil: iso(NOW - 60_000) })], NOW)).toBe(true);
  });
});

/* ------------------------------- recipients ------------------------------- */

describe("report dialog recipients", () => {
  const status: MailStatus = { configured: true, sender: "nennep@example.edu.vn", allowedDomains: DOMAINS, baseUrl: "https://nennep.example.edu.vn", missing: [] };
  const classes: ClassInfo[] = [
    { code: "6A01", levelId: "THCS", grade: 6, active: true, order: 0 },
    { code: "6A02", levelId: "THCS", grade: 6, active: true, order: 1 },
    { code: "7A01", levelId: "THCS", grade: 7, active: true, order: 2 },
    { code: "7A09", levelId: "THCS", grade: 7, active: false, order: 3 },
  ];
  const ds = { levelId: "THCS" as const, classes };
  const classRecipients = {
    classes: [
      { classCode: "6A01", grade: 6, teacher: "GV Lớp Một", recipients: ["gv.6a01@example.edu.vn"], missing: false },
      { classCode: "6A02", grade: 6, recipients: ["gv.6a02@example.edu.vn"], missing: false },
      { classCode: "7A01", grade: 7, recipients: [], missing: true },
    ],
    blocked: ["phu.6a01@gmail.example"],
  };
  const settings = {
    report: {
      bgh: ["bgh@example.edu.vn", "bgh@gmail.example"],
      grades: { "6": ["to6@example.edu.vn"], "9": ["to9@example.edu.vn"] },
      cc: ["cc@example.edu.vn", "phu.6a01@gmail.example"],
    },
  };

  it("staff: BGH, every tổ khối with active classes, every active class; allowed addresses only, blocked ones listed once", () => {
    const res = buildReportMailRecipients({ status, settings, options: recipientOptions({ role: "EDITOR", gvcnClasses: [] }, ds), classRecipients });
    expect(res).toEqual({
      status,
      bgh: ["bgh@example.edu.vn"],
      cc: ["cc@example.edu.vn"],
      grades: [
        { grade: 6, recipients: ["to6@example.edu.vn"] },
        { grade: 7, recipients: [] },
      ],
      classes: classRecipients.classes,
      blocked: ["bgh@gmail.example", "phu.6a01@gmail.example"],
    });
  });

  it("a GVCN only gets their own classes (no BGH, no tổ khối)", () => {
    const res = buildReportMailRecipients({
      status,
      settings,
      options: recipientOptions({ role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A02" }] }, ds),
      classRecipients,
    });
    expect(res.bgh).toEqual([]);
    expect(res.grades).toEqual([]);
    expect(res.classes.map((c) => c.classCode)).toEqual(["6A02"]);
  });

  it("without any allowed domain every settings address is blocked", () => {
    const res = buildReportMailRecipients({
      status: { ...status, configured: false, allowedDomains: [] },
      settings: { report: { bgh: ["bgh@example.edu.vn"], grades: {}, cc: [] } },
      options: recipientOptions({ role: "ADMIN", gvcnClasses: [] }, ds),
      classRecipients: { classes: [], blocked: [] },
    });
    expect(res.bgh).toEqual([]);
    expect(res.classes).toEqual([]);
    expect(res.blocked).toEqual(["bgh@example.edu.vn"]);
  });
});

/* ------------------------------- print / pdf ------------------------------ */

const SPEC: PrintJobSpec = { levelId: "THCS", mode: "week", key: "2026-10-19", to: "khoi-6", detail: true, addressee: "Tổ khối 6", viewerUid: "u1", preparedBy: "A" };

describe("print jobs", () => {
  // Nonces carry a MAC: give them a key (more in mail-print-nonce.test.ts).
  beforeAll(() => vi.stubEnv("PRINT_JOB_SECRET", "k".repeat(32)));
  afterAll(() => vi.unstubAllEnvs());

  it("nonces are 64 hex characters, different every time; anything else is rejected", () => {
    const a = newPrintNonce();
    expect(isPrintNonce(a)).toBe(true);
    expect(newPrintNonce()).not.toBe(a);
    for (const bad of ["", "abc", a.toUpperCase(), `${a}0`, "../../x", `${a.slice(0, 63)}g`]) expect(isPrintNonce(bad), bad).toBe(false);
  });

  it("a job stores the spec without undefined fields and lives PRINT_JOB_TTL_MS", () => {
    const doc = printJobDoc({ ...SPEC, note: undefined }, NOW);
    expect(doc).toEqual({ spec: SPEC, createdAt: iso(NOW), expiresAt: iso(NOW + PRINT_JOB_TTL_MS) });
    expect("note" in doc.spec).toBe(false);
    expect(isPrintJobLive(doc, NOW + PRINT_JOB_TTL_MS - 1)).toBe(true);
    expect(isPrintJobLive(doc, NOW + PRINT_JOB_TTL_MS)).toBe(false);
    expect(isPrintJobLive({ expiresAt: "nope" }, NOW)).toBe(false);
  });
});

describe("Chromium", () => {
  const origin = "https://nennep.example.edu.vn";
  it("print page URL", () => {
    expect(printPageUrl(origin, "ab".repeat(32))).toBe(`${origin}/in/bao-cao/${"ab".repeat(32)}`);
  });

  it("loads only documents, styles, fonts and images of the app origin (+ data: resources)", () => {
    expect(isAllowedPrintRequest(`${origin}/in/bao-cao/x`, origin, "document")).toBe(true);
    expect(isAllowedPrintRequest(`${origin}/_next/static/css/app.css`, origin, "stylesheet")).toBe(true);
    expect(isAllowedPrintRequest(`${origin}/_next/static/media/lexend.woff2`, origin, "font")).toBe(true);
    expect(isAllowedPrintRequest("data:image/png;base64,AAAA", origin, "image")).toBe(true);
    expect(isAllowedPrintRequest(`${origin}/_next/static/chunks/main.js`, origin, "script")).toBe(false);
    expect(isAllowedPrintRequest(`${origin}/api/dataset?level=THCS`, origin, "fetch")).toBe(false);
    expect(isAllowedPrintRequest("https://fonts.example.com/a.woff2", origin, "font")).toBe(false);
    expect(isAllowedPrintRequest("https://nennep.example.edu.vn.evil.example/x.css", origin, "stylesheet")).toBe(false);
    expect(isAllowedPrintRequest("http://nennep.example.edu.vn/x.css", origin, "stylesheet")).toBe(false);
    expect(isAllowedPrintRequest("data:text/html,<p>x</p>", origin, "document")).toBe(false);
    expect(isAllowedPrintRequest("not a url", origin, "image")).toBe(false);
  });

  it("launch plan: CHROME_EXECUTABLE_PATH, else the default Chrome of macOS / Windows, else @sparticuz/chromium", () => {
    const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;
    expect(chromeLaunchPlan(env({ CHROME_EXECUTABLE_PATH: " /opt/chrome/chrome " }), "linux")).toEqual({ kind: "local", executablePath: "/opt/chrome/chrome" });
    expect(chromeLaunchPlan(env({}), "darwin")).toEqual({ kind: "local", executablePath: MAC_CHROME_PATH });
    expect(chromeLaunchPlan(env({}), "win32")).toEqual({ kind: "local", executablePath: WINDOWS_CHROME_PATH });
    expect(chromeLaunchPlan(env({ CHROME_EXECUTABLE_PATH: "  " }), "linux")).toEqual({ kind: "serverless" });
  });

  it("step timeout: 45 s, shortened near the drain deadline; not started with less than 10 s left (OutOfTimeError)", () => {
    expect(pdfStepTimeout(undefined, NOW)).toBe(PDF_PAGE_TIMEOUT_MS);
    expect(pdfStepTimeout(NOW + 120_000, NOW)).toBe(PDF_PAGE_TIMEOUT_MS);
    expect(pdfStepTimeout(NOW + 30_000, NOW)).toBe(25_000);
    expect(pdfStepTimeout(NOW + 15_000, NOW)).toBe(10_000);
    expect(() => pdfStepTimeout(NOW + 1_000, NOW)).toThrow(OutOfTimeError);
  });

  it("download header: attachment with an ASCII and an UTF-8 file name", () => {
    expect(pdfAttachmentDisposition("NSHM_Bao-cao_THCS_Tuan-19-10_25-10-2026_Khoi-6.pdf")).toBe(
      "attachment; filename=\"NSHM_Bao-cao_THCS_Tuan-19-10_25-10-2026_Khoi-6.pdf\"; filename*=UTF-8''NSHM_Bao-cao_THCS_Tuan-19-10_25-10-2026_Khoi-6.pdf",
    );
    expect(pdfAttachmentDisposition('Báo "cáo".pdf')).toBe("attachment; filename=\"B_o _c_o_.pdf\"; filename*=UTF-8''B%C3%A1o%20%22c%C3%A1o%22.pdf");
  });
});

/** Plain data only (what a server component may hand to a client component). */
function isPlainData(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (["string", "number", "boolean"].includes(typeof v)) return true;
  if (Array.isArray(v)) return v.every(isPlainData);
  if (typeof v === "object") return Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(isPlainData);
  return false;
}

describe("ReportPrintView (server render of the print page content)", () => {
  const ds = makeFixtureDataset();
  const report = buildPeriodReport(ds, { period: { mode: "week", key: "2026-10-19" }, recipient: { kind: "grade", grade: 6 } }, FIXTURE_TODAY);
  const props = {
    report,
    detail: true,
    topRatio: ds.config.top90Ratio,
    today: FIXTURE_TODAY,
    preparedBy: "Cán bộ Thử",
    plan: { items: [{ content: "Tổng vệ sinh lớp học", owner: "GVCN khối 6" }], note: "Phối hợp Đoàn trường" },
  };

  it("props are plain serialisable data", () => {
    expect(isPlainData(props)).toBe(true);
  });

  it("renders the A4 document alone: print stylesheet, report, saved plan, detail register, signatures", () => {
    const html = renderToStaticMarkup(createElement(ReportPrintView, props));
    expect(html.startsWith("<main")).toBe(true);
    for (const text of [
      "size: A4",
      REPORT_DOC_ATTR,
      "BÁO CÁO NỀN NẾP TUẦN 19/10 – 25/10/2026",
      "Tổ khối 6",
      "Công tác phối hợp tuần mới",
      "Tổng vệ sinh lớp học",
      "Phối hợp Đoàn trường",
      "Chi tiết sự việc",
      "Người lập báo cáo",
      "Cán bộ Thử",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain("<script");
  });
});
