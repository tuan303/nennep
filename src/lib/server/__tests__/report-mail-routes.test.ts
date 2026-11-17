/**
 * Report email & PDF (emulators): GET /api/reports/mail/recipients (cached / fresh settings), POST /api/reports/mail
 * (validation: permissions, level, period, forbidden targets, blocked domains, not configured, size; per-user rate and
 * the school-wide daily recipient budget; queued jobs + audit + drain), GET /api/mail/batches/:id (progress, stall →
 * drain again), GET /api/reports/pdf, print jobs, the print page and the REPORT job builder (PDF-less fallback, missing
 * print-job key). The transport, the drain scheduler and the Chromium renderer are test doubles; fake addresses only.
 */
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ReportPrintPage, { generateMetadata } from "@/app/in/bao-cao/[job]/page";
import { GET as batchGET } from "@/app/api/mail/batches/[id]/route";
import { GET as recipientsGET } from "@/app/api/reports/mail/recipients/route";
import { POST as sendPOST } from "@/app/api/reports/mail/route";
import { GET as pdfGET } from "@/app/api/reports/pdf/route";
import { reportFileBase } from "@/components/report/lib/report-export";
import { MAIL_DAILY_REPORT_RECIPIENTS, MAIL_JOB_MAX_ATTEMPTS } from "../../constants";
import type { ApiErrorBody, MailBatchResponse, ReportMailRecipientsResponse, ReportMailSendInput, ReportMailSendResponse } from "../../contract";
import { addDays, mondayOf, monthOf, todayVN } from "../../engine/dates";
import { periodLabel } from "../../engine/period";
import { COL, reportPlanId } from "../../firestore-paths";
import type { AuditLog, MailJob, MailSettings, ReportJobPayload, ReportPlan } from "../../types";
import { invalidateProfileCache } from "../auth";
import { db } from "../firebase-admin";
import { MAIL_BUDGET_MSG, mailBudgetRef } from "../mail/budget";
import { LONG_DRAIN_MS, setDrainSchedulerForTests, type DrainOptions } from "../mail/drain";
import { compareOldestFirst } from "../mail/job-state";
import { TransientLaunchError, setPdfRendererForTests } from "../mail/pdf";
import { PrintKeyMissingError } from "../mail/print-key";
import { createPrintJob, deletePrintJob, deleteStalePrintJobs, printJobRef, PRINT_JOB_TTL_MS, readPrintJob, type PrintJobSpec } from "../mail/print-jobs";
import { classRecipients } from "../mail/recipients";
import { loadReportForJob, REPORT_DATA_MSG } from "../mail/report-data";
import { buildReportJob, REPORT_BUILDERS } from "../mail/report-job";
import { pdfAttachmentDisposition, REPORT_PDF_MSG } from "../mail/report-pdf";
import { REPORT_MAIL_RATE, REPORT_SEND_MSG } from "../mail/report-send";
import { invalidateMailSettingsCache } from "../mail/settings";
import { setMailTransportForTests } from "../mail/transport";
import { MailSendError, type DrainContext, type MailTransport, type OutgoingMail } from "../mail/types";
import { callRoute, createTestUser, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-report-mail";
const WEEK = mondayOf(todayVN());
const MONTH = monthOf(WEEK);
const FAR_WEEK = addDays(WEEK, 7 * 40); // after the end of the test calendar
const SENDER = "nennep@example.edu.vn";
const FAKE_PDF = Buffer.from("%PDF-1.7 fake report");

const t = { admin: "", editor: "", editorTh: "", viewer: "", gvcn: "" };
const scheduled: DrainOptions[] = [];
const rendered: PrintJobSpec[] = [];

const CONFIGURED: MailTransport = {
  configured: true,
  sender: SENDER,
  async send(_mail: OutgoingMail): Promise<void> {},
};
const UNCONFIGURED: MailTransport = {
  configured: false,
  async send(): Promise<void> {
    throw new MailSendError("Chưa cấu hình gửi email.", false);
  },
};

type Err = ApiErrorBody;
const recipients = (token: string, level = "THCS", extra = "") =>
  callRoute<ReportMailRecipientsResponse & Err>(recipientsGET, { url: `/api/reports/mail/recipients?level=${level}${extra}`, token });
const send = (token: string, body: ReportMailSendInput | Record<string, unknown>) =>
  callRoute<ReportMailSendResponse & Err>(sendPOST, { method: "POST", url: "/api/reports/mail", token, body });
const batch = (token: string, id: string) => callRoute<MailBatchResponse & Err>(batchGET, { url: `/api/mail/batches/${id}`, params: { id }, token });
const pdf = (token: string, query: string) => callRoute<Err>(pdfGET, { url: `/api/reports/pdf?${query}`, token });

const sendBody = (over: Partial<ReportMailSendInput> = {}): ReportMailSendInput =>
  ({ levelId: "THCS", mode: "week", key: WEEK, detail: true, ccSelf: false, targets: [{ to: "bgh", recipients: ["bgh@example.edu.vn"] }], ...over }) as ReportMailSendInput;

const outbox = async () => (await listDocs<MailJob>(COL.mailOutbox)).sort(compareOldestFirst);
const batchJobs = async (batchId: string) => (await outbox()).filter((j) => j.batchId === batchId);
const reportPayload = (j: MailJob) => j.payload as ReportJobPayload;
const iso = (ms: number) => new Date(ms).toISOString();

async function patchJobs(batchId: string, patch: (j: MailJob) => Partial<MailJob>): Promise<void> {
  for (const j of await batchJobs(batchId)) await db().collection(COL.mailOutbox).doc(j.id).update(patch(j));
}

function drainContext(): DrainContext {
  return { baseUrl: "https://nennep.example.edu.vn", transport: CONFIGURED, deadline: Date.now() + 120_000, cache: new Map(), onFinish: () => undefined };
}

describe("report email & PDF", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    invalidateMailSettingsCache();
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN", email: "admin@example.edu.vn", displayName: "Quản trị Thử" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", displayName: "Cán bộ Thử" })).token; // editor@nshm.test: outside the domain
    t.editorTh = (await createTestUser({ uid: "editorTh", role: "EDITOR", levels: ["TH"] })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", email: "gv.6a02@example.edu.vn", gvcnClasses: [{ levelId: "THCS", classCode: "6A02" }] })).token;
    await createTestUser({ uid: "gvcnOld", role: "GVCN", email: "cu.6a01@example.edu.vn", active: false, gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] });
    await seedReference("THCS", {
      classes: [
        { code: "6A01", homeroomTeacher: "GV Lớp Một", homeroomEmail: "GV.6A01@example.edu.vn; phu.6a01@gmail.example" },
        "6A02",
        { code: "7A01", homeroomEmail: "khong-hop-le" },
        { code: "7A09", active: false, homeroomEmail: "cu.7a09@example.edu.vn" },
      ],
    });
    const settings: MailSettings = {
      levelId: "THCS",
      notices: { enabled: false, incidents: true, rewards: true },
      report: { bgh: ["bgh@example.edu.vn", "bgh@gmail.example"], grades: { "6": ["to6@example.edu.vn"] }, cc: ["cc@example.edu.vn"] },
      allowedDomains: [],
      rev: 1,
    };
    await db().collection(COL.mailSettings).doc("THCS").set(settings);
    const plan: ReportPlan = {
      id: reportPlanId("THCS", "week", WEEK),
      levelId: "THCS",
      mode: "week",
      key: WEEK,
      items: [{ content: "Tổng vệ sinh lớp học", owner: "GVCN khối 6" }],
      rev: 1,
      updatedAt: iso(Date.now()),
      updatedBy: "admin@example.edu.vn",
      updatedByName: "Quản trị Thử",
    };
    await db().collection(COL.reportPlans).doc(plan.id).set(plan);
    invalidateMailSettingsCache();
    setMailTransportForTests(CONFIGURED);
    setDrainSchedulerForTests((opts) => scheduled.push(opts));
    setPdfRendererForTests(async (spec) => {
      rendered.push(spec);
      return FAKE_PDF;
    });
  });

  afterAll(() => {
    setMailTransportForTests(null);
    setDrainSchedulerForTests(null);
    setPdfRendererForTests(null);
    invalidateMailSettingsCache();
  });

  beforeEach(() => {
    setMailTransportForTests(CONFIGURED);
  });

  /* ------------------------------- recipients ------------------------------- */

  it("recipients: defaults per group inside the sender's domain, GVCN of each active class, blocked addresses", async () => {
    const res = await recipients(t.admin);
    expect(res.status).toBe(200);
    expect(res.body.status).toMatchObject({ configured: true, sender: SENDER, allowedDomains: ["example.edu.vn"], missing: [] });
    expect(res.body.bgh).toEqual(["bgh@example.edu.vn"]);
    expect(res.body.cc).toEqual(["cc@example.edu.vn"]);
    expect(res.body.grades).toEqual([
      { grade: 6, recipients: ["to6@example.edu.vn"] },
      { grade: 7, recipients: [] },
    ]);
    // 6A01: homeroomEmail (the locked GVCN account is ignored); 6A02: the GVCN account; 7A01: none; 7A09 inactive.
    expect(res.body.classes).toEqual([
      { classCode: "6A01", grade: 6, teacher: "GV Lớp Một", recipients: ["gv.6a01@example.edu.vn"], missing: false },
      { classCode: "6A02", grade: 6, recipients: ["gv.6a02@example.edu.vn"], missing: false },
      { classCode: "7A01", grade: 7, recipients: [], missing: true },
    ]);
    expect(res.body.blocked).toEqual(["bgh@gmail.example", "phu.6a01@gmail.example"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("recipients: MAIL_SENDER set but mail not fully configured → class rows use the sender's domain like the status", async () => {
    setMailTransportForTests(null);
    vi.stubEnv("MAIL_SENDER", SENDER);
    for (const name of ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET"]) vi.stubEnv(name, "");
    try {
      const res = await recipients(t.admin);
      expect(res.status).toBe(200);
      expect(res.body.status).toMatchObject({ configured: false, sender: SENDER, allowedDomains: ["example.edu.vn"] });
      expect(res.body.classes.map((c) => [c.classCode, c.recipients, c.missing])).toEqual([
        ["6A01", ["gv.6a01@example.edu.vn"], false],
        ["6A02", ["gv.6a02@example.edu.vn"], false],
        ["7A01", [], true],
      ]);
      expect(res.body.blocked).toEqual(["bgh@gmail.example", "phu.6a01@gmail.example"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("recipients: fresh=1 (Cài đặt → Email) reads the settings uncached – a save handled by another instance shows at once", async () => {
    const ref = db().collection(COL.mailSettings).doc("THCS");
    const original = (await ref.get()).data() as MailSettings;
    invalidateMailSettingsCache();
    try {
      expect((await recipients(t.admin)).body.bgh).toEqual(["bgh@example.edu.vn"]); // cached on this instance now
      // Another instance saves (its own cache is cleared, not this one's).
      await ref.update({ "report.bgh": ["hieu.truong@example.edu.vn"], rev: original.rev + 1 });
      expect((await recipients(t.admin)).body.bgh).toEqual(["bgh@example.edu.vn"]); // the dialog's cached read
      const fresh = await recipients(t.admin, "THCS", "&fresh=1");
      expect(fresh.status).toBe(200);
      expect(fresh.body.bgh).toEqual(["hieu.truong@example.edu.vn"]);
      expect((await recipients(t.admin, "THCS", "&fresh=2")).status).toBe(400);
    } finally {
      await ref.set(original);
      invalidateMailSettingsCache();
    }
  });

  it("class recipients of a notice: only the accounts assigned to that class (active GVCN), whatever the map key order", async () => {
    const users = db().collection(COL.users);
    await createTestUser({ uid: "editorGv", role: "EDITOR", email: "editor.gv@example.edu.vn", gvcnClasses: [{ levelId: "THCS", classCode: "6A02" }] });
    await users.doc("gvcn7").set({ uid: "gvcn7", email: "gv.7a01@example.edu.vn", displayName: "GV 7A01", role: "GVCN", levels: ["THCS"], gvcnClasses: [{ classCode: "7A01", levelId: "THCS" }], active: true, createdAt: iso(Date.now()) });
    try {
      const settings = { allowedDomains: [] };
      expect(await classRecipients("THCS", "6A02", settings)).toEqual({ allowed: ["gv.6a02@example.edu.vn"], blocked: [] });
      // Locked account ignored; homeroomEmail of the class list (one address outside the domain).
      expect(await classRecipients("THCS", "6A01", settings)).toEqual({ allowed: ["gv.6a01@example.edu.vn"], blocked: ["phu.6a01@gmail.example"] });
      expect(await classRecipients("THCS", "7A01", settings)).toEqual({ allowed: ["gv.7a01@example.edu.vn"], blocked: [] });
      expect(await classRecipients("TH", "6A02", settings)).toEqual({ allowed: [], blocked: [] });
    } finally {
      await users.doc("editorGv").delete();
      await users.doc("gvcn7").delete();
    }
  });

  it("recipients: report.send + level only; the level must be valid", async () => {
    for (const token of [t.viewer, t.gvcn]) expect((await recipients(token)).status).toBe(403);
    const other = await recipients(t.editorTh);
    expect(other.status).toBe(403);
    expect(other.body.error.message).toBe("Bạn không có quyền truy cập dữ liệu của cấp học này.");
    expect((await recipients(t.admin, "XX")).status).toBe(400);
  });

  /* ---------------------------------- send ---------------------------------- */

  it("send: 403 for roles without report.send and for another level; nothing queued", async () => {
    for (const token of [t.viewer, t.gvcn]) expect((await send(token, sendBody())).status).toBe(403);
    expect((await send(t.editorTh, sendBody())).status).toBe(403);
    expect(await outbox()).toEqual([]);
  });

  it("send: 409 when mail is not configured", async () => {
    setMailTransportForTests(UNCONFIGURED);
    const res = await send(t.admin, sendBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "CONFLICT", message: REPORT_SEND_MSG.notConfigured });
    expect(await outbox()).toEqual([]);
  });

  it("send: 400 for a period outside the calendar or not a Monday / real month", async () => {
    const far = await send(t.admin, sendBody({ key: FAR_WEEK }));
    expect(far.status).toBe(400);
    expect(far.body.error.message).toBe(REPORT_DATA_MSG.period);
    expect((await send(t.admin, sendBody({ key: addDays(WEEK, 1) }))).status).toBe(400);
    expect((await send(t.admin, sendBody({ mode: "month", key: "2026-13" } as Partial<ReportMailSendInput>))).status).toBe(400);
    expect(await outbox()).toEqual([]);
  });

  it("send: 403 for targets the caller may not address (inactive class, unknown grade / class)", async () => {
    const res = await send(
      t.admin,
      sendBody({
        targets: [
          { to: "bgh", recipients: ["bgh@example.edu.vn"] },
          { to: "lop-7A09", recipients: ["gv@example.edu.vn"] },
          { to: "khoi-9", recipients: ["gv@example.edu.vn"] },
        ],
      }),
    );
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(REPORT_SEND_MSG.forbidden(["lop-7A09", "khoi-9"]));
    expect(await outbox()).toEqual([]);
  });

  it("send: 400 listing the addresses outside the allowed domains (incl. the caller's own copy)", async () => {
    const res = await send(t.admin, sendBody({ targets: [{ to: "bgh", recipients: ["bgh@example.edu.vn", "Ban.GH@Gmail.example"] }] }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(REPORT_SEND_MSG.blocked(["ban.gh@gmail.example"]));
    expect(res.body.error.details).toEqual({ blocked: ["ban.gh@gmail.example"] });
    const self = await send(t.editor, sendBody({ ccSelf: true }));
    expect(self.status).toBe(400);
    expect(self.body.error.message).toBe(REPORT_SEND_MSG.blocked(["editor@nshm.test"]));
    expect(await outbox()).toEqual([]);
  });

  it("send: schema errors (invalid address, duplicate target, empty list, long note)", async () => {
    for (const body of [
      sendBody({ targets: [{ to: "bgh", recipients: ["khong-hop-le"] }] }),
      sendBody({ targets: [{ to: "bgh", recipients: ["a@example.edu.vn"] }, { to: "bgh", recipients: ["b@example.edu.vn"] }] }),
      sendBody({ targets: [] }),
      sendBody({ targets: [{ to: "bgh", recipients: [] }] }),
      sendBody({ targets: [{ to: "nguoi-la", recipients: ["a@example.edu.vn"] }] }),
      sendBody({ note: "x".repeat(1001) }),
    ]) {
      const res = await send(t.admin, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION");
    }
    expect(await outbox()).toEqual([]);
  });

  let batchId = "";

  it("send: one PENDING job per target in target order, cc = settings CC ∪ caller, audit without addresses, drain scheduled", async () => {
    const res = await send(
      t.admin,
      sendBody({
        ccSelf: true,
        note: "  Kính chuyển BGH.\nTrân trọng.  ",
        targets: [
          { to: "bgh", recipients: ["BGH@example.edu.vn"] },
          { to: "khoi-6", recipients: ["to6@example.edu.vn", "gv.6a01@example.edu.vn"] },
          { to: "lop-6A01", recipients: ["gv.6a01@example.edu.vn"] },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ batchId: expect.any(String), jobs: 3 });
    batchId = res.body.batchId;

    const jobs = await batchJobs(batchId);
    expect(jobs.map((j) => reportPayload(j).addressee)).toEqual(["Ban Giám hiệu", "Tổ khối 6", "GVCN lớp 6A01"]);
    expect(jobs[0]).toMatchObject({
      levelId: "THCS",
      kind: "REPORT",
      status: "PENDING",
      to: ["bgh@example.edu.vn"],
      cc: ["cc@example.edu.vn", "admin@example.edu.vn"],
      batchId,
      attempts: 0,
      createdBy: "admin",
      createdByName: "Quản trị Thử",
      payload: { mode: "week", key: WEEK, to: "bgh", detail: true, addressee: "Ban Giám hiệu", note: "Kính chuyển BGH.\nTrân trọng.", viewerUid: "admin", preparedBy: "Quản trị Thử" },
    });
    expect(jobs[1].to).toEqual(["to6@example.edu.vn", "gv.6a01@example.edu.vn"]);
    for (const j of jobs) {
      expect(j.id).toMatch(/^\d{13}_[0-9a-z]{8}$/);
      expect(j.nextAttemptAt).toBe(j.createdAt);
      expect(Date.parse(j.createdAt)).toBeLessThanOrEqual(Date.now());
      expect("subject" in j || "sentAt" in j || "leaseUntil" in j).toBe(false);
    }
    expect(new Set(jobs.map((j) => j.createdAt)).size).toBe(3);

    const audits = (await listDocs<AuditLog>(COL.auditLogs)).filter((a) => a.action === "SEND_REPORT_EMAIL");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entity: "mailBatch", entityId: batchId, levelId: "THCS", email: "admin@example.edu.vn", role: "ADMIN", ip: "203.0.113.7" });
    expect(audits[0].detail).toEqual({ mode: "week", key: WEEK, targets: 3, recipients: 5, detail: true, ccSelf: true });
    expect(JSON.stringify(audits[0].detail)).not.toContain("@");

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ batchId, kinds: ["REPORT"], deadlineMs: LONG_DRAIN_MS, baseUrl: expect.stringMatching(/^https?:\/\//) });
    expect(scheduled[0].builders).toBe(REPORT_BUILDERS);
  });

  it("send: a month report of the calendar works too (EDITOR, no copy)", async () => {
    const res = await send(t.editor, sendBody({ mode: "month", key: MONTH, detail: false, targets: [{ to: "khoi-6", recipients: ["to6@example.edu.vn"] }] } as Partial<ReportMailSendInput>));
    expect(res.status).toBe(200);
    const [job] = await batchJobs(res.body.batchId);
    expect(job).toMatchObject({ to: ["to6@example.edu.vn"], cc: ["cc@example.edu.vn"], createdBy: "editor" });
    expect(reportPayload(job)).toEqual({ mode: "month", key: MONTH, to: "khoi-6", detail: false, addressee: "Tổ khối 6", viewerUid: "editor", preparedBy: "Cán bộ Thử" });
  });

  it(`send: at most ${REPORT_MAIL_RATE.limit} accepted sends per user in 10 minutes (429, nothing queued); rejected ones do not count`, async () => {
    const busy = (await createTestUser({ uid: "busy", role: "EDITOR", email: "busy@example.edu.vn" })).token;
    const mine = async () => (await outbox()).filter((j) => j.createdBy === "busy");
    expect((await send(busy, sendBody({ targets: [{ to: "bgh", recipients: ["x@gmail.example"] }] }))).status).toBe(400);
    for (let i = 0; i < REPORT_MAIL_RATE.limit; i++) expect((await send(busy, sendBody())).status).toBe(200);
    const before = scheduled.length;
    const res = await send(busy, sendBody());
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: "RATE_LIMITED", message: REPORT_SEND_MSG.rateLimited });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await mine()).toHaveLength(REPORT_MAIL_RATE.limit);
    expect(scheduled).toHaveLength(before);
    // Per user: another account still sends.
    expect((await send(t.admin, sendBody())).status).toBe(200);
  });

  it(`send: at most ${MAIL_DAILY_REPORT_RECIPIENTS} report recipients per day for the whole school (429, nothing queued); accepted sends are counted`, async () => {
    const budgeted = (await createTestUser({ uid: "budget", role: "EDITOR", email: "budget@example.edu.vn" })).token;
    const counter = mailBudgetRef(todayVN());
    const used = async () => ((await counter.get()).data()?.reportRecipients as number | undefined) ?? 0;
    const mine = async () => (await outbox()).filter((j) => j.createdBy === "budget");
    const saved = (await counter.get()).data();
    try {
      // Every accepted send so far today was counted: to + cc of each message.
      const start = await used();
      const two = sendBody({
        targets: [
          { to: "bgh", recipients: ["bgh@example.edu.vn"] }, // + cc@ = 2
          { to: "khoi-6", recipients: ["to6@example.edu.vn", "gv.6a01@example.edu.vn"] }, // + cc@ = 3
        ],
      });
      expect((await send(budgeted, two)).status).toBe(200);
      expect(await used()).toBe(start + 5);

      // Close to the cap (other levels sent a lot today): 2 more fit exactly, then nothing.
      await counter.set({ day: todayVN(), reportRecipients: MAIL_DAILY_REPORT_RECIPIENTS - 2, updatedAt: new Date().toISOString() });
      expect((await send(budgeted, sendBody())).status).toBe(200);
      expect(await used()).toBe(MAIL_DAILY_REPORT_RECIPIENTS);
      const jobsBefore = await mine();
      const auditsBefore = (await listDocs<AuditLog>(COL.auditLogs)).length;
      const scheduledBefore = scheduled.length;
      const over = await send(budgeted, sendBody());
      expect(over.status).toBe(429);
      expect(over.body.error).toMatchObject({ code: "RATE_LIMITED", message: MAIL_BUDGET_MSG.exceeded(2, 0) });
      expect(over.body.error.message).toContain("3.000");
      const retryAfter = Number(over.headers.get("retry-after"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(86_400);
      // Nothing written: no job, no audit, no drain, the counter unchanged – also for another user.
      expect(await mine()).toHaveLength(jobsBefore.length);
      expect((await listDocs<AuditLog>(COL.auditLogs)).length).toBe(auditsBefore);
      expect(scheduled).toHaveLength(scheduledBefore);
      expect(await used()).toBe(MAIL_DAILY_REPORT_RECIPIENTS);
      expect((await send(t.admin, sendBody())).status).toBe(429);

      // One request larger than what is left is refused as a whole.
      await counter.set({ day: todayVN(), reportRecipients: MAIL_DAILY_REPORT_RECIPIENTS - 4, updatedAt: new Date().toISOString() });
      const big = await send(budgeted, two);
      expect(big.status).toBe(429);
      expect(big.body.error.message).toBe(MAIL_BUDGET_MSG.exceeded(5, 4));
      expect(await used()).toBe(MAIL_DAILY_REPORT_RECIPIENTS - 4);
    } finally {
      if (saved) await counter.set(saved);
      else await counter.delete();
    }
  });

  it("the daily recipient counters are server-only: firestore.rules refuse every client read and write", async () => {
    const day = todayVN();
    await mailBudgetRef(day).set({ day, reportRecipients: 1, updatedAt: new Date().toISOString() });
    const base = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
    const asClient = (path: string, token?: string, init: RequestInit = {}) =>
      fetch(`${base}/${path}`, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    try {
      // Control: the token is accepted by the rules (an active account may read meta/versions).
      expect((await asClient("meta/versions", t.admin)).status).not.toBe(403);
      for (const token of [undefined, t.admin, t.editor]) {
        expect((await asClient(`${COL.mailBudget}/${day}`, token)).status, `read ${token ? "signed in" : "anonymous"}`).toBe(403);
        const write = await asClient(`${COL.mailBudget}/${day}`, token, { method: "PATCH", body: JSON.stringify({ fields: { reportRecipients: { integerValue: "0" } } }) });
        expect(write.status, `write ${token ? "signed in" : "anonymous"}`).toBe(403);
      }
      expect((await mailBudgetRef(day).get()).data()?.reportRecipients).toBe(1);
    } finally {
      await mailBudgetRef(day).delete();
    }
  });

  /* ---------------------------------- batch --------------------------------- */

  it("batch: progress in send order; a fresh batch is not drained again", async () => {
    const before = scheduled.length;
    const res = await batch(t.editor, batchId);
    expect(res.status).toBe(200);
    expect(res.body.batchId).toBe(batchId);
    expect(res.body.items.map((i) => [i.addressee, i.status])).toEqual([
      ["Ban Giám hiệu", "PENDING"],
      ["Tổ khối 6", "PENDING"],
      ["GVCN lớp 6A01", "PENDING"],
    ]);
    expect(res.body.items[0].to).toEqual(["bgh@example.edu.vn"]);
    expect(res.body.counts).toEqual({ PENDING: 3, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 });
    expect(res.body.done).toBe(false);
    expect(scheduled).toHaveLength(before);
  });

  it("batch: stalled (due for > 20 s, nothing sending) → drained again; not while a job is sending", async () => {
    const old = iso(Date.now() - 60_000);
    await patchJobs(batchId, () => ({ createdAt: old, nextAttemptAt: old }));
    const before = scheduled.length;
    expect((await batch(t.admin, batchId)).status).toBe(200);
    expect(scheduled).toHaveLength(before + 1);
    expect(scheduled.at(-1)).toMatchObject({ batchId, kinds: ["REPORT"], deadlineMs: LONG_DRAIN_MS });

    const [first] = await batchJobs(batchId);
    await db().collection(COL.mailOutbox).doc(first.id).update({ status: "SENDING", attempts: 1, leaseUntil: iso(Date.now() + 200_000) });
    expect((await batch(t.admin, batchId)).body.counts.SENDING).toBe(1);
    expect(scheduled).toHaveLength(before + 1);
  });

  it("batch: done once every job is finished (errors / sent time reported)", async () => {
    const before = scheduled.length;
    await patchJobs(batchId, (j) =>
      reportPayload(j).to === "lop-6A01"
        ? { status: "FAILED", lastError: "Lỗi thử nghiệm" }
        : { status: "SENT", sentAt: iso(Date.now() - 30_000), attempts: 1 },
    );
    const res = await batch(t.admin, batchId);
    expect(res.body.done).toBe(true);
    expect(res.body.counts).toEqual({ PENDING: 0, SENDING: 0, SENT: 2, FAILED: 1, SKIPPED: 0 });
    expect(res.body.items[2]).toMatchObject({ addressee: "GVCN lớp 6A01", status: "FAILED", lastError: "Lỗi thử nghiệm" });
    expect(res.body.items[0].sentAt).toEqual(expect.any(String));
    expect(scheduled).toHaveLength(before);
  });

  it("batch: 404 for unknown / malformed ids, 403 without report.send or level access", async () => {
    expect((await batch(t.admin, "khong-co-lan-gui-nay")).status).toBe(404);
    expect((await batch(t.admin, "x")).status).toBe(404);
    for (const token of [t.viewer, t.gvcn, t.editorTh]) expect((await batch(token, batchId)).status).toBe(403);
  });

  /* ------------------------------- job builder ------------------------------ */

  it("REPORT builder: report email of the job with the PDF attached, recipients of the job", async () => {
    const [job] = (await batchJobs(batchId)).filter((j) => reportPayload(j).to === "bgh");
    rendered.length = 0;
    const built = await buildReportJob({ ...job, status: "SENDING", attempts: 1 }, drainContext());
    if (!("mail" in built)) throw new Error(`skipped: ${built.skip}`);
    const { mail } = built;
    expect(mail.to).toEqual(["bgh@example.edu.vn"]);
    expect(mail.cc).toEqual(["cc@example.edu.vn", "admin@example.edu.vn"]);
    expect(mail.subject).toBe(`[Nền nếp] Báo cáo nền nếp THCS – ${periodLabel({ mode: "week", key: WEEK }, [])} – Kính gửi: Ban Giám hiệu`);
    expect(mail.html).toContain("Kính chuyển BGH.<br>Trân trọng.");
    expect(mail.html).toContain(`https://nennep.example.edu.vn/bao-cao?level=THCS&amp;mode=week&amp;key=${WEEK}&amp;to=bgh&amp;detail=1`);
    expect(mail.html).toContain("Tổng vệ sinh lớp học");
    expect(mail.text).toContain("Ban Giám hiệu – Trung học cơ sở");
    expect(mail.attachments).toEqual([
      {
        name: `${reportFileBase({ levelId: "THCS", periodLabel: periodLabel({ mode: "week", key: WEEK }, []), scopeLabel: "Toàn cấp" })}.pdf`,
        contentType: "application/pdf",
        contentBase64: FAKE_PDF.toString("base64"),
      },
    ]);
    expect(rendered).toEqual([{ ...reportPayload(job), levelId: "THCS" }]);
  });

  it("REPORT builder: a failed PDF is retried, sent without PDF on the last attempt; a too large PDF is not attached", async () => {
    const [job] = await batchJobs(batchId);
    setPdfRendererForTests(async () => {
      throw new Error("chromium crashed");
    });
    const err = await buildReportJob({ ...job, attempts: 1 }, drainContext()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailSendError);
    expect((err as MailSendError).retryable).toBe(true);
    const last = await buildReportJob({ ...job, attempts: MAIL_JOB_MAX_ATTEMPTS }, drainContext());
    expect("mail" in last && last.mail.attachments).toBeFalsy();
    expect("mail" in last && last.mail.html).toContain("Chưa tạo được file PDF của báo cáo");

    // A transient launch failure (timeout, memory) is an ordinary failed render: retried.
    setPdfRendererForTests(async () => {
      throw new TransientLaunchError(new Error("spawn ENOMEM"));
    });
    const transient = await buildReportJob({ ...job, attempts: 1 }, drainContext()).catch((e: unknown) => e);
    expect(transient).toBeInstanceOf(MailSendError);
    expect((transient as MailSendError).retryable).toBe(true);

    setPdfRendererForTests(async () => Buffer.alloc(2_400_000, 0x41));
    const big = await buildReportJob({ ...job, attempts: 1 }, drainContext());
    expect("mail" in big && big.mail.attachments).toBeFalsy();
    expect("mail" in big && big.mail.html).toContain("vượt quá dung lượng gửi kèm");
    setPdfRendererForTests(async (spec) => {
      rendered.push(spec);
      return FAKE_PDF;
    });
  });

  it("REPORT builder: without a print-job key (PRINT_JOB_SECRET too short) the email goes out at once, without the PDF", async () => {
    const [job] = await batchJobs(batchId);
    setPdfRendererForTests(null); // the real renderer: it creates the print job first, before any browser
    vi.stubEnv("PRINT_JOB_SECRET", "ngan-qua");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const built = await buildReportJob({ ...job, attempts: 1 }, drainContext());
      if (!("mail" in built)) throw new Error(`skipped: ${built.skip}`);
      expect(built.mail.attachments).toBeUndefined();
      expect(built.mail.html).toContain("Chưa tạo được file PDF của báo cáo");
      const logged = errors.mock.calls.map((c) => c.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(" ")).join("\n");
      expect(logged).toContain("PrintKeyMissingError");
      expect(logged).toContain("PRINT_JOB_SECRET is set but shorter than 32 characters");
      expect(logged).not.toContain("ngan-qua");
      expect(await listDocs(COL.printJobs)).toEqual([]);
    } finally {
      errors.mockRestore();
      vi.unstubAllEnvs();
      setPdfRendererForTests(async (spec) => {
        rendered.push(spec);
        return FAKE_PDF;
      });
    }
  });

  /* ------------------------------ print / data ------------------------------ */

  const spec = (over: Partial<PrintJobSpec> = {}): PrintJobSpec => ({
    levelId: "THCS",
    mode: "week",
    key: WEEK,
    to: "khoi-6",
    detail: true,
    addressee: "Tổ khối 6",
    viewerUid: "admin",
    preparedBy: "Quản trị Thử",
    ...over,
  });

  it("print jobs: readable until they expire, deleted after use; the cron removes stale ones", async () => {
    const nonce = await createPrintJob(spec());
    expect((await readPrintJob(nonce))?.spec).toEqual(spec());
    expect(await readPrintJob(nonce, Date.now() + PRINT_JOB_TTL_MS + 1_000)).toBeNull();
    expect(await readPrintJob("0".repeat(64))).toBeNull();
    expect(await readPrintJob("../users/admin")).toBeNull();
    await deletePrintJob(nonce);
    expect(await readPrintJob(nonce)).toBeNull();

    const fresh = await createPrintJob(spec());
    const stale = "a".repeat(64);
    await printJobRef(stale).set({ spec: spec(), createdAt: iso(Date.now() - 2 * 3_600_000), expiresAt: iso(Date.now() - 2 * 3_600_000 + PRINT_JOB_TTL_MS) });
    expect(await deleteStalePrintJobs()).toBe(1);
    expect((await printJobRef(stale).get()).exists).toBe(false);
    expect(await readPrintJob(fresh)).not.toBeNull();
    await deletePrintJob(fresh);
  });

  it("print page: the A4 report of the job (saved plan, detail, signature) as the viewer sees it; 404 otherwise", async () => {
    const nonce = await createPrintJob(spec());
    const props = { params: Promise.resolve({ job: nonce }) };
    const element = (await ReportPrintPage(props)) as ReactElement;
    expect(isValidElement(element)).toBe(true);
    const html = renderToStaticMarkup(element);
    for (const text of ["BÁO CÁO NỀN NẾP TUẦN", "Tổ khối 6", "Công tác phối hợp tuần mới", "Tổng vệ sinh lớp học", "Chi tiết sự việc", "Người lập báo cáo", "Quản trị Thử"]) {
      expect(html, text).toContain(text);
    }
    const meta = await generateMetadata(props);
    expect(meta.title).toEqual({ absolute: reportFileBase({ levelId: "THCS", periodLabel: periodLabel({ mode: "week", key: WEEK }, []), scopeLabel: "Khối 6" }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
    await deletePrintJob(nonce);

    const missing = await ReportPrintPage({ params: Promise.resolve({ job: nonce }) }).catch((e: unknown) => e);
    expect((missing as { digest?: string }).digest).toContain("404");
  });

  it("report data is re-checked against the viewer's current rights", async () => {
    expect((await loadReportForJob(spec())).ok).toBe(true);
    expect(await loadReportForJob(spec({ viewerUid: "gvcn", to: "lop-6A01" }))).toEqual({ ok: false, reason: REPORT_DATA_MSG.recipient("lop-6A01") });
    expect((await loadReportForJob(spec({ viewerUid: "gvcn", to: "lop-6A02" }))).ok).toBe(true);
    expect(await loadReportForJob(spec({ viewerUid: "editorTh" }))).toEqual({ ok: false, reason: REPORT_DATA_MSG.viewerLevel });
    expect(await loadReportForJob(spec({ key: FAR_WEEK }))).toEqual({ ok: false, reason: REPORT_DATA_MSG.period });
    expect(await loadReportForJob(spec({ viewerUid: "gvcnOld", to: "lop-6A01" }))).toEqual({ ok: false, reason: REPORT_DATA_MSG.viewerInactive });
    expect(await loadReportForJob(spec({ viewerUid: "nobody" }))).toEqual({ ok: false, reason: REPORT_DATA_MSG.viewerInactive });
  });

  /* ----------------------------------- PDF ---------------------------------- */

  it("PDF: download of the report of the screen (attachment, file name, viewer = caller), also without mail configuration", async () => {
    rendered.length = 0;
    setMailTransportForTests(UNCONFIGURED);
    const res = await pdf(t.admin, `level=THCS&mode=week&key=${WEEK}&to=khoi-6&detail=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const fileName = `${reportFileBase({ levelId: "THCS", periodLabel: periodLabel({ mode: "week", key: WEEK }, []), scopeLabel: "Khối 6" })}.pdf`;
    expect(res.headers.get("content-disposition")).toBe(pdfAttachmentDisposition(fileName));
    expect(res.bytes.equals(FAKE_PDF)).toBe(true);
    expect(rendered).toEqual([spec()]);

    expect((await pdf(t.viewer, `level=THCS&mode=month&key=${MONTH}&to=bgh`)).status).toBe(200);
    expect(rendered.at(-1)).toMatchObject({ viewerUid: "viewer", mode: "month", key: MONTH, to: "bgh", detail: false, addressee: "Ban Giám hiệu" });
  });

  it("PDF: a GVCN only gets their own class; level, recipient and period are validated", async () => {
    expect((await pdf(t.gvcn, `level=THCS&mode=week&key=${WEEK}&to=lop-6A02`)).status).toBe(200);
    expect(rendered.at(-1)).toMatchObject({ viewerUid: "gvcn", to: "lop-6A02", addressee: "GVCN lớp 6A02" });
    for (const to of ["lop-6A01", "bgh", "khoi-6"]) {
      const res = await pdf(t.gvcn, `level=THCS&mode=week&key=${WEEK}&to=${to}`);
      expect(res.status, to).toBe(403);
      expect(res.body.error.message).toBe(REPORT_PDF_MSG.recipient);
    }
    expect((await pdf(t.editorTh, `level=THCS&mode=week&key=${WEEK}&to=bgh`)).status).toBe(403);
    for (const q of [`level=THCS&mode=week&key=${FAR_WEEK}&to=bgh`, `level=THCS&mode=week&key=${addDays(WEEK, 2)}&to=bgh`, `level=THCS&mode=week&key=${WEEK}&to=ai-do`, "level=THCS&to=bgh"]) {
      expect((await pdf(t.admin, q)).status, q).toBe(400);
    }
  });

  it("PDF: a rendering failure is a 500 with a Vietnamese message; a missing print-job key says so", async () => {
    setPdfRendererForTests(async () => {
      throw new Error("timeout");
    });
    const res = await pdf(t.admin, `level=THCS&mode=week&key=${WEEK}&to=bgh`);
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe(REPORT_PDF_MSG.failed);
    setPdfRendererForTests(async () => {
      throw new PrintKeyMissingError("too-short");
    });
    const noKey = await pdf(t.admin, `level=THCS&mode=week&key=${WEEK}&to=bgh`);
    expect(noKey.status).toBe(500);
    expect(noKey.body.error.message).toBe(REPORT_PDF_MSG.noKey);
  });

  it("a locked sender: pending report emails are skipped", async () => {
    await db().collection(COL.users).doc("editor").update({ active: false });
    invalidateProfileCache("editor");
    const [job] = (await outbox()).filter((j) => j.createdBy === "editor");
    expect(await buildReportJob({ ...job, attempts: 1 }, drainContext())).toEqual({ skip: REPORT_DATA_MSG.viewerInactive });
  });
});
