/**
 * Mail routes on the emulators (fake transport, fake addresses): Cài đặt → Email GET / PUT (normalisation, audit with
 * counts only, baseRev 409, grades of the level), "Gửi thư thử" (sync send, errors, 429), Nhật ký gửi thư, "Gửi lại"
 * (rights, statuses, audit, drain scheduled) and the cron (Bearer CRON_SECRET, drain + stale print jobs + old daily
 * recipient counters).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as cronGET } from "@/app/api/cron/mail/route";
import { POST as retryPOST } from "@/app/api/mail/jobs/[id]/retry/route";
import { GET as logGET } from "@/app/api/mail/log/route";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/settings/[level]/mail/route";
import { POST as testPOST } from "@/app/api/settings/[level]/mail/test/route";
import type { ApiErrorBody, MailCronResponse, MailLogResponse, MailSettingsInput, MailSettingsResponse, MailTestResponse, OkResponse } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import { COL, mailJobId } from "../../firestore-paths";
import type { AuditLog, MailJob, MailSettings } from "../../types";
import { db } from "../firebase-admin";
import { LONG_DRAIN_MS, setDrainIntervalForTests, setDrainSchedulerForTests, type DrainOptions } from "../mail/drain";
import { JOB_STATE_MSG } from "../mail/job-state";
import { OUTBOX_MSG } from "../mail/outbox";
import { REPORT_BUILDERS } from "../mail/report-job";
import { MAIL_SETTINGS_MSG, invalidateMailSettingsCache, loadMailSettings } from "../mail/settings";
import { TEST_MAIL_SUBJECT } from "../mail/test-job";
import { TEST_MAIL_LIMIT, TEST_MAIL_MSG } from "../mail/test-mail";
import { MAIL_REQUIRED_ENV, mailNotConfiguredMessage, setMailTransportForTests } from "../mail/transport";
import { MailSendError, OutOfTimeError, type MailTransport, type OutgoingMail } from "../mail/types";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-mail-routes";
const t = { admin: "", adminTh: "", editor: "", editor2: "", viewer: "", outsider: "", limited: "" };

const sent: OutgoingMail[] = [];
const scheduled: DrainOptions[] = [];
let failWith: Error | undefined;
const fake: MailTransport = {
  configured: true,
  sender: "nennep@example.edu.vn",
  async send(mail) {
    if (failWith) throw failWith;
    sent.push(mail);
  },
};

const settingsUrl = (level: string) => `/api/settings/${level}/mail`;
const getSettings = (token: string, level = "THCS") =>
  callRoute<MailSettingsResponse & ApiErrorBody>(settingsGET, { url: settingsUrl(level), token, params: { level } });
const putSettings = (token: string, body: MailSettingsInput | Record<string, unknown>, level = "THCS") =>
  callRoute<MailSettingsResponse & ApiErrorBody>(settingsPUT, { method: "PUT", url: settingsUrl(level), token, params: { level }, body });
const sendTest = (token: string, level = "THCS") =>
  callRoute<MailTestResponse & ApiErrorBody>(testPOST, { method: "POST", url: `${settingsUrl(level)}/test`, token, params: { level }, body: {} });
const getLog = (token: string, query: string) => callRoute<MailLogResponse & ApiErrorBody>(logGET, { url: `/api/mail/log?${query}`, token });
const retry = (token: string, id: string) => callRoute<OkResponse & ApiErrorBody>(retryPOST, { method: "POST", url: `/api/mail/jobs/${id}/retry`, token, params: { id }, body: {} });
const audits = async (action: AuditLog["action"]) => (await listDocs<AuditLog>(COL.auditLogs)).filter((a) => a.action === action);

const SETTINGS: MailSettingsInput = {
  notices: { enabled: true, incidents: true, rewards: false },
  report: {
    bgh: ["BGH@Example.edu.vn", "bgh@example.edu.vn", "pho.hieutruong@example.edu.vn"],
    grades: { "7": ["to.khoi7@example.edu.vn"], "6": ["To.Khoi6@example.edu.vn"], "8": [] },
    cc: ["mailto:thuky@example.edu.vn"],
  },
  allowedDomains: ["@Example.edu.vn", "example.edu.vn"],
};

async function insertJob(over: Partial<MailJob> = {}): Promise<MailJob> {
  const now = Date.now();
  const job: MailJob = {
    id: mailJobId(now),
    levelId: "THCS",
    kind: "TEST",
    status: "FAILED",
    to: ["admin@example.edu.vn"],
    cc: [],
    payload: { kind: "TEST" },
    attempts: 5,
    nextAttemptAt: new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
    createdBy: "admin",
    createdByName: "Quản trị",
    lastError: "Microsoft 365 tạm thời chưa nhận thư (HTTP 503) – hệ thống sẽ tự gửi lại.",
    ...over,
  };
  await db().collection(COL.mailOutbox).doc(job.id).set(job);
  return job;
}

async function clearCollection(name: string): Promise<void> {
  const snap = await db().collection(name).get();
  const batch = db().batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}

describe("mail routes", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    invalidateMailSettingsCache();
    await seedReference("THCS", { classes: ["6A01", "7A01"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN", email: "admin@example.edu.vn", displayName: "Quản trị" })).token;
    t.adminTh = (await createTestUser({ uid: "adminTh", role: "ADMIN", email: "admin.th@example.edu.vn", levels: ["TH"] })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", email: "editor@example.edu.vn" })).token;
    t.editor2 = (await createTestUser({ uid: "editor2", role: "EDITOR", email: "editor2@example.edu.vn" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER", email: "viewer@example.edu.vn" })).token;
    t.outsider = (await createTestUser({ uid: "outsider", role: "ADMIN", email: "admin2@gmail.test" })).token;
    t.limited = (await createTestUser({ uid: "limited", role: "ADMIN", email: "limited@example.edu.vn" })).token;
    setDrainSchedulerForTests((o) => scheduled.push(o));
    setDrainIntervalForTests(0);
  });

  afterAll(() => {
    setMailTransportForTests(null);
    setDrainSchedulerForTests(null);
    setDrainIntervalForTests(null);
    invalidateMailSettingsCache();
  });

  beforeEach(() => {
    setMailTransportForTests(fake);
    sent.length = 0;
    scheduled.length = 0;
    failWith = undefined;
  });

  describe("settings", () => {
    it("GET: defaults when never saved + the sending configuration (unconfigured lists the missing variables)", async () => {
      setMailTransportForTests(null);
      const res = await getSettings(t.admin);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.body.settings).toEqual({
        levelId: "THCS",
        notices: { enabled: false, incidents: true, rewards: true },
        report: { bgh: [], grades: {}, cc: [] },
        allowedDomains: [],
        rev: 0,
      });
      expect(res.body.status).toMatchObject({ configured: false, allowedDomains: [], baseUrl: "http://localhost:3000", senderName: "Nền nếp NSHM" });
      expect(res.body.status.missing).toEqual([...MAIL_REQUIRED_ENV]);

      setMailTransportForTests(fake);
      const configured = await getSettings(t.admin);
      expect(configured.body.status).toMatchObject({ configured: true, sender: "nennep@example.edu.vn", allowedDomains: ["example.edu.vn"], missing: [] });
    });

    it("GET / PUT need settings.manage and access to the level", async () => {
      for (const token of [t.editor, t.viewer]) {
        expect((await getSettings(token)).status).toBe(403);
        expect((await putSettings(token, SETTINGS)).status).toBe(403);
      }
      const other = await getSettings(t.adminTh);
      expect(other.status).toBe(403);
      expect(other.body.error.message).toBe("Bạn không có quyền truy cập dữ liệu của cấp học này.");
      expect((await putSettings(t.adminTh, SETTINGS)).status).toBe(403);
      expect((await getSettings(t.admin, "XX")).status).toBe(400);
      expect(await listDocs(COL.mailSettings)).toHaveLength(0);
    });

    it("PUT stores normalised settings (rev 1) and audits counts only – never an address", async () => {
      const res = await putSettings(t.admin, SETTINGS);
      expect(res.status).toBe(200);
      const expected: Omit<MailSettings, "updatedAt"> = {
        levelId: "THCS",
        notices: { enabled: true, incidents: true, rewards: false },
        report: {
          bgh: ["bgh@example.edu.vn", "pho.hieutruong@example.edu.vn"],
          grades: { "6": ["to.khoi6@example.edu.vn"], "7": ["to.khoi7@example.edu.vn"] },
          cc: ["thuky@example.edu.vn"],
        },
        allowedDomains: ["example.edu.vn"],
        rev: 1,
        updatedBy: "admin@example.edu.vn",
      };
      expect(res.body.settings).toMatchObject(expected);
      expect(Date.parse(res.body.settings.updatedAt ?? "")).not.toBeNaN();
      expect(res.body.status.allowedDomains).toEqual(["example.edu.vn"]);
      expect(await getDoc<MailSettings>(COL.mailSettings, "THCS")).toEqual(res.body.settings);
      expect(await loadMailSettings("THCS")).toEqual(res.body.settings); // cache invalidated by the save

      const log = await audits("UPDATE_MAIL_SETTINGS");
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ entity: "mailSettings", entityId: "THCS", levelId: "THCS", email: "admin@example.edu.vn", ip: "203.0.113.7" });
      expect(log[0].detail).toEqual({
        changed: ["notices", "report", "allowedDomains"],
        notices: { enabled: true, incidents: true, rewards: false },
        bgh: 2,
        grades: { "6": 1, "7": 1 },
        cc: 1,
        allowedDomains: 1,
      });
      expect(JSON.stringify(log[0].detail)).not.toContain("@");
    });

    it("PUT with a stale or missing baseRev → 409; the same content again writes nothing", async () => {
      const stale = await putSettings(t.admin, { ...SETTINGS, baseRev: 0 });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toEqual({ code: "CONFLICT", message: MAIL_SETTINGS_MSG.stale });
      expect((await putSettings(t.admin, SETTINGS)).status).toBe(409); // omitted = 0
      const same = await putSettings(t.admin, { ...SETTINGS, baseRev: 1 });
      expect(same.status).toBe(200);
      expect(same.body.settings.rev).toBe(1);
      expect(await audits("UPDATE_MAIL_SETTINGS")).toHaveLength(1);
      const next = await putSettings(t.admin, { ...SETTINGS, notices: { enabled: false, incidents: true, rewards: true }, baseRev: 1 });
      expect(next.status).toBe(200);
      expect(next.body.settings.rev).toBe(2);
      expect((await audits("UPDATE_MAIL_SETTINGS")).length).toBe(2);
    });

    it("PUT rejects grades outside the level, invalid addresses and domains (400, nothing written)", async () => {
      const grade = await putSettings(t.admin, { ...SETTINGS, report: { ...SETTINGS.report, grades: { "10": ["to.khoi10@example.edu.vn"] } }, baseRev: 2 });
      expect(grade.status).toBe(400);
      expect(grade.body.error.message).toBe(MAIL_SETTINGS_MSG.gradesOutside(["10"], "Trung học cơ sở"));
      const email = await putSettings(t.admin, { ...SETTINGS, report: { ...SETTINGS.report, bgh: ["khong-hop-le"] }, baseRev: 2 });
      expect(email.status).toBe(400);
      expect(email.body.error.message).toContain("Địa chỉ email không hợp lệ: khong-hop-le");
      const domain = await putSettings(t.admin, { ...SETTINGS, allowedDomains: ["http://example"], baseRev: 2 });
      expect(domain.status).toBe(400);
      expect((await getDoc<MailSettings>(COL.mailSettings, "THCS"))?.rev).toBe(2);
    });

    it("GET reads the stored version, not this instance's 30 s cache; a 409 save clears the cache", async () => {
      const ref = db().collection(COL.mailSettings).doc("THCS");
      expect((await loadMailSettings("THCS")).rev).toBe(2); // cached here
      await ref.update({ rev: 3 }); // saved on another instance: this cache is not told
      expect((await loadMailSettings("THCS")).rev).toBe(2);
      const latest = await getSettings(t.admin);
      expect(latest.body.settings.rev).toBe(3); // "Tải bản mới nhất" gets the stored rev (→ next baseRev)
      expect((await loadMailSettings("THCS")).rev).toBe(3); // and refreshed the cache

      await ref.update({ rev: 4 });
      expect((await loadMailSettings("THCS")).rev).toBe(3);
      const conflict = await putSettings(t.admin, { ...SETTINGS, baseRev: 3 });
      expect(conflict.status).toBe(409);
      expect((await loadMailSettings("THCS")).rev).toBe(4); // the 409 dropped the stale entry
      // After reloading, the save goes through (same content as stored → nothing written, rev unchanged).
      const retried = await putSettings(t.admin, { ...SETTINGS, notices: { enabled: false, incidents: true, rewards: true }, baseRev: (await getSettings(t.admin)).body.settings.rev });
      expect(retried.status).toBe(200);
      expect(retried.body.settings.rev).toBe(4);
    });
  });

  describe("test message", () => {
    it("409 while mail is not configured (nothing queued)", async () => {
      setMailTransportForTests(null);
      const res = await sendTest(t.admin);
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe(mailNotConfiguredMessage([...MAIL_REQUIRED_ENV]));
      expect((await listDocs<MailJob>(COL.mailOutbox)).filter((j) => j.kind === "TEST")).toHaveLength(0);
    });

    it("sends now to the caller's own address: { ok: true }, TEST job SENT, audit SEND_TEST_EMAIL", async () => {
      const res = await sendTest(t.admin);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: ["admin@example.edu.vn"], cc: [], subject: TEST_MAIL_SUBJECT });
      const jobs = (await listDocs<MailJob>(COL.mailOutbox)).filter((j) => j.kind === "TEST");
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ status: "SENT", attempts: 1, to: ["admin@example.edu.vn"], createdBy: "admin", levelId: "THCS" });
      const log = await audits("SEND_TEST_EMAIL");
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ entity: "mailJob", entityId: jobs[0].id, levelId: "THCS" });
    });

    it("{ ok: false, error } when Microsoft 365 refuses it – the job is FAILED, never retried later", async () => {
      failWith = new MailSendError("Ứng dụng chưa được cấp quyền gửi thư từ hộp thư nennep@example.edu.vn", false, undefined, 403);
      const denied = await sendTest(t.admin);
      expect(denied.status).toBe(200);
      expect(denied.body).toEqual({ ok: false, error: "Ứng dụng chưa được cấp quyền gửi thư từ hộp thư nennep@example.edu.vn" });
      failWith = new MailSendError("Microsoft 365 tạm thời chưa nhận thư (HTTP 503) – hệ thống sẽ tự gửi lại.", true, undefined, 503);
      const busy = await sendTest(t.admin);
      expect(busy.body.ok).toBe(false);
      const failed = (await listDocs<MailJob>(COL.mailOutbox)).filter((j) => j.kind === "TEST" && j.status === "FAILED");
      expect(failed).toHaveLength(2);
    });

    it("no time left to start the Graph request (OutOfTimeError): { ok: false } with the out-of-time reason, job FAILED", async () => {
      failWith = new OutOfTimeError("not enough time left to start a Microsoft Graph request");
      const before = (await listDocs<MailJob>(COL.mailOutbox)).filter((j) => j.kind === "TEST").length;
      const res = await sendTest(t.admin);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false, error: JOB_STATE_MSG.outOfTime });
      const tests = (await listDocs<MailJob>(COL.mailOutbox)).filter((j) => j.kind === "TEST");
      expect(tests).toHaveLength(before + 1);
      const newest = tests.sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      expect(newest).toMatchObject({ status: "FAILED", lastError: JOB_STATE_MSG.outOfTime });
      expect(newest.lastError).not.toContain("tự gửi lại");
    });

    it("400 when the caller's address is outside the allowed domains; 403 without settings.manage", async () => {
      const res = await sendTest(t.outsider);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe(TEST_MAIL_MSG.blocked("admin2@gmail.test", ["example.edu.vn"]));
      expect((await sendTest(t.editor)).status).toBe(403);
      expect((await sendTest(t.adminTh)).status).toBe(403);
    });

    it(`at most ${TEST_MAIL_LIMIT} test messages per user in 10 minutes (429)`, async () => {
      for (let i = 0; i < TEST_MAIL_LIMIT; i++) expect((await sendTest(t.limited)).status).toBe(200);
      const res = await sendTest(t.limited);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("RATE_LIMITED");
      expect(res.headers.get("retry-after")).not.toBeNull();
    });
  });

  describe("mail log", () => {
    it("newest first, labelled, without payloads; settings.manage + level; limit 1..200", async () => {
      const res = await getLog(t.admin, "level=THCS&limit=3");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      const ids = res.body.items.map((i) => i.id);
      expect([...ids].sort()).toEqual(ids);
      for (const item of res.body.items) {
        expect(item.label).toBe("Thư thử");
        expect("payload" in item).toBe(false);
      }
      const all = await getLog(t.admin, "level=THCS");
      expect(all.body.items.length).toBeGreaterThanOrEqual(8);
      expect((await getLog(t.admin, "level=TH")).body.items).toEqual([]);
      expect((await getLog(t.editor, "level=THCS")).status).toBe(403);
      expect((await getLog(t.adminTh, "level=THCS")).status).toBe(403);
      for (const q of ["level=THCS&limit=0", "level=THCS&limit=500", "limit=10", "level=XX"]) expect((await getLog(t.admin, q)).status, q).toBe(400);
    });
  });

  describe("retry", () => {
    it("settings.manage: FAILED / SKIPPED → PENDING (attempts 0, errors cleared), audit RETRY_EMAIL, drain scheduled", async () => {
      const failed = await insertJob();
      const res = await retry(t.admin, failed.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      const stored = await getDoc<MailJob>(COL.mailOutbox, failed.id);
      expect(stored).toMatchObject({ status: "PENDING", attempts: 0 });
      expect("lastError" in (stored ?? {})).toBe(false);
      const log = (await audits("RETRY_EMAIL")).filter((a) => a.entityId === failed.id);
      expect(log).toHaveLength(1);
      expect(log[0].detail).toEqual({ kind: "TEST", status: "FAILED", attempts: 5 });
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]).toMatchObject({ kinds: ["TEST"], deadlineMs: LONG_DRAIN_MS });
      expect(scheduled[0].builders).toBe(REPORT_BUILDERS);

      const skipped = await insertJob({ status: "SKIPPED", lastError: undefined, skipReason: "Lớp 6A01 chưa có email GVCN", kind: "REPORT", batchId: "batch-1" });
      expect((await retry(t.admin, skipped.id)).status).toBe(200);
      expect(await getDoc<MailJob>(COL.mailOutbox, skipped.id)).not.toHaveProperty("skipReason");
      expect(scheduled[1]).toMatchObject({ kinds: ["REPORT"], batchId: "batch-1" });
    });

    it("409 for jobs that are not FAILED / SKIPPED; 404 for unknown ids", async () => {
      const pending = await insertJob({ status: "PENDING", attempts: 0 });
      const sentJob = await insertJob({ status: "SENT", attempts: 1, sentAt: new Date().toISOString() });
      for (const id of [pending.id, sentJob.id]) {
        const res = await retry(t.admin, id);
        expect(res.status).toBe(409);
        expect(res.body.error.message).toBe(OUTBOX_MSG.retryStatus);
      }
      const missing = await retry(t.admin, "0000000000000_nothing0");
      expect(missing.status).toBe(404);
      expect(missing.body.error.message).toBe(OUTBOX_MSG.notFound);
      expect(scheduled).toHaveLength(0);
    });

    it("report.send may retry only its own jobs; other levels and viewers are refused", async () => {
      const own = await insertJob({ createdBy: "editor", kind: "REPORT", batchId: "batch-2" });
      const others = await insertJob({ createdBy: "editor2", kind: "REPORT", batchId: "batch-3" });
      expect((await retry(t.editor, own.id)).status).toBe(200);
      const forbidden = await retry(t.editor, others.id);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.message).toBe(OUTBOX_MSG.retryForbidden);
      expect((await retry(t.viewer, others.id)).status).toBe(403);
      expect((await retry(t.adminTh, others.id)).status).toBe(403);
      expect((await getDoc<MailJob>(COL.mailOutbox, others.id))?.status).toBe("FAILED");
    });
  });

  describe("cron", () => {
    const savedSecret = process.env.CRON_SECRET;
    afterEach(() => {
      if (savedSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = savedSecret;
    });

    it("401 without the right Bearer secret; with it: drains every kind and deletes print jobs older than 1 h", async () => {
      await clearCollection(COL.mailOutbox);
      const today = todayVN();
      const days = [addDays(today, -5), addDays(today, -3), addDays(today, -2), addDays(today, -1), today];
      for (const day of days) await db().collection(COL.mailBudget).doc(day).set({ day, reportRecipients: 10, updatedAt: new Date().toISOString() });
      const pending = await insertJob({ status: "PENDING", attempts: 0, lastError: undefined, to: ["gv.6a01@example.edu.vn"] });
      const now = Date.now();
      const spec = { mode: "week", key: "2026-10-19", to: "bgh", detail: false, addressee: "Ban Giám hiệu", viewerUid: "admin", preparedBy: "Quản trị", levelId: "THCS" };
      await db().collection(COL.printJobs).doc("a".repeat(64)).set({ spec, createdAt: new Date(now - 2 * 3_600_000).toISOString(), expiresAt: new Date(now - 2 * 3_600_000 + 180_000).toISOString() });
      await db().collection(COL.printJobs).doc("b".repeat(64)).set({ spec, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 180_000).toISOString() });

      delete process.env.CRON_SECRET;
      expect((await callRoute(cronGET, { url: "/api/cron/mail", headers: { authorization: "Bearer cron-secret-test" } })).status).toBe(401);
      process.env.CRON_SECRET = "cron-secret-test";
      expect((await callRoute(cronGET, { url: "/api/cron/mail", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
      expect((await callRoute(cronGET, { url: "/api/cron/mail", token: t.admin })).status).toBe(401); // a user token is not the secret
      expect((await getDoc<MailJob>(COL.mailOutbox, pending.id))?.status).toBe("PENDING");

      const res = await callRoute<MailCronResponse>(cronGET, { url: "/api/cron/mail", headers: { authorization: "Bearer cron-secret-test" } });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, sent: 1, failed: 0, skipped: 0, retried: 0, printJobsDeleted: 1 });
      expect(await getDoc<MailJob>(COL.mailOutbox, pending.id)).toMatchObject({ status: "SENT", to: ["gv.6a01@example.edu.vn"] });
      expect(sent).toHaveLength(1);
      expect((await listDocs(COL.printJobs)).map((d) => d.__id)).toEqual(["b".repeat(64)]);
      // Daily recipient counters: today and the two days before are kept, older ones deleted.
      expect((await listDocs(COL.mailBudget)).map((d) => d.__id).sort()).toEqual(days.slice(2));
    });
  });
});
