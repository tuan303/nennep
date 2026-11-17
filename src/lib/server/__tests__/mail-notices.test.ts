/**
 * GVCN notices end to end (emulators + fake transport): queued in the incident / reward transaction only when mail is
 * configured, notices are on for that kind and the actor is staff; class move → MOVED_OUT + CREATED; confirming a GVCN
 * proposal → CONFIRMED; then drained to the class GVCN(s) – SKIPPED without an (allowed) address.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as incDELETE, PATCH as incPATCH } from "@/app/api/incidents/[id]/route";
import { POST as feedbackPOST } from "@/app/api/incidents/[id]/feedback/route";
import { POST as incRestorePOST } from "@/app/api/incidents/[id]/restore/route";
import { POST as incPOST } from "@/app/api/incidents/route";
import { DELETE as rwDELETE, PATCH as rwPATCH } from "@/app/api/rewards/[id]/route";
import { POST as rwRestorePOST } from "@/app/api/rewards/[id]/restore/route";
import { POST as rwPOST } from "@/app/api/rewards/route";
import { IncidentCreateSchema, type ApiErrorBody, type IncidentCreateInput, type RewardCreateInput } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import { COL } from "../../firestore-paths";
import type { Incident, MailJob, MailSettings, NoticePayload, Reward } from "../../types";
import type { SessionUser } from "../auth";
import { db } from "../firebase-admin";
import { createIncident } from "../incidents";
import { drainMail, setDrainIntervalForTests, setDrainSchedulerForTests, type DrainOptions } from "../mail/drain";
import { NOTICE_DRAIN_MS } from "../mail/notice-drain";
import { NOTICE_JOB_MSG, buildNoticeJob, isNoticePayload } from "../mail/outbox";
import { invalidateMailSettingsCache } from "../mail/settings";
import { setMailTransportForTests } from "../mail/transport";
import type { MailTransport, OutgoingMail } from "../mail/types";
import { callRoute, createTestUser, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-mail-notices";
const BASE = "https://nennep.example.edu.vn";
const yesterday = addDays(todayVN(), -1);
const t = { admin: "", editor: "", gvcn: "" };
let adminUser: SessionUser;

const sent: OutgoingMail[] = [];
const scheduled: DrainOptions[] = [];
const fake: MailTransport = {
  configured: true,
  sender: "nennep@example.edu.vn",
  async send(mail) {
    sent.push(mail);
  },
};

async function saveSettings(notices: MailSettings["notices"], allowedDomains: string[] = []): Promise<void> {
  const settings: MailSettings = { levelId: "THCS", notices, report: { bgh: [], grades: {}, cc: [] }, allowedDomains, rev: 1 };
  await db().collection(COL.mailSettings).doc("THCS").set(settings);
  invalidateMailSettingsCache();
}
const ALL_ON = { enabled: true, incidents: true, rewards: true };

const incidentBody = (over: Partial<IncidentCreateInput> = {}): IncidentCreateInput => ({
  levelId: "THCS",
  date: yesterday,
  classCode: "6A01",
  errorCode: "L02",
  scope: "Tập thể",
  ...over,
});
const rewardBody = (over: Partial<RewardCreateInput> = {}): RewardCreateInput => ({
  levelId: "THCS",
  date: yesterday,
  classCode: "6A01",
  points: 2,
  reason: "Lớp tích cực tham gia phong trào",
  ...over,
});
const createInc = (token: string, over: Partial<IncidentCreateInput> = {}) =>
  callRoute<Incident & ApiErrorBody>(incPOST, { method: "POST", url: "/api/incidents", token, body: incidentBody(over) });
const patchInc = (token: string, id: string, body: Record<string, unknown>) =>
  callRoute<Incident & ApiErrorBody>(incPATCH, { method: "PATCH", url: `/api/incidents/${id}`, token, params: { id }, body });
const createRw = (token: string, over: Partial<RewardCreateInput> = {}) =>
  callRoute<Reward & ApiErrorBody>(rwPOST, { method: "POST", url: "/api/rewards", token, body: rewardBody(over) });
const patchRw = (token: string, id: string, body: Record<string, unknown>) =>
  callRoute<Reward & ApiErrorBody>(rwPATCH, { method: "PATCH", url: `/api/rewards/${id}`, token, params: { id }, body });

type NoticeJob = MailJob & { payload: NoticePayload };
async function noticesOf(recordId: string): Promise<NoticeJob[]> {
  return (await listDocs<MailJob>(COL.mailOutbox))
    .filter((j): j is typeof j & NoticeJob => j.kind === "NOTICE" && isNoticePayload(j.payload) && j.payload.snapshot.recordId === recordId)
    .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1));
}
const events = (jobs: NoticeJob[]) => jobs.map((j) => `${j.payload.event}:${j.payload.snapshot.classCode}`);

describe("GVCN notices", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    invalidateMailSettingsCache();
    await seedReference("THCS", {
      classes: ["6A01", { code: "6A02", homeroomEmail: "gv.6a02@example.edu.vn" }, "6A03", { code: "6A04", homeroomEmail: "gv.6a04@gmail.test" }],
      students: [{ id: "S1", name: "Học sinh A", classCode: "6A01" }],
    });
    const admin = await createTestUser({ uid: "admin", role: "ADMIN", email: "admin@example.edu.vn", displayName: "Quản trị" });
    adminUser = { uid: admin.uid, email: admin.email, profile: admin.profile };
    t.admin = admin.token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", email: "editor@example.edu.vn", displayName: "Cô Lan" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", email: "gv.6a01@example.edu.vn", displayName: "GVCN 6A01", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
    setMailTransportForTests(fake);
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
    sent.length = 0;
    scheduled.length = 0;
  });

  it("queues nothing while mail is not configured, notices are off, or the kind is unticked", async () => {
    await saveSettings(ALL_ON);
    setMailTransportForTests(null);
    const unconfigured = await createInc(t.editor);
    expect(unconfigured.status).toBe(201);
    expect(await noticesOf(unconfigured.body.id)).toEqual([]);
    setMailTransportForTests(fake);

    await saveSettings({ enabled: false, incidents: true, rewards: true });
    const off = await createInc(t.editor);
    expect(off.status).toBe(201);
    expect(await noticesOf(off.body.id)).toEqual([]);

    await saveSettings({ enabled: true, incidents: false, rewards: true });
    const inc = await createInc(t.editor);
    expect(await noticesOf(inc.body.id)).toEqual([]);
    const rw = await createRw(t.editor);
    expect(rw.status).toBe(201);
    expect(events(await noticesOf(rw.body.id))).toEqual(["CREATED:6A01"]);
    expect(scheduled).toHaveLength(1);
  });

  it("a staff incident queues one PENDING CREATED notice in the same commit; the route schedules a NOTICE drain", async () => {
    await saveSettings(ALL_ON);
    const res = await createInc(t.editor, { errorCode: "L01", scope: "Cá nhân", studentIds: ["S1"], detail: "Cổng trường" });
    expect(res.status).toBe(201);
    const jobs = await noticesOf(res.body.id);
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    expect(job).toMatchObject({ levelId: "THCS", kind: "NOTICE", status: "PENDING", to: [], cc: [], attempts: 0, createdBy: "editor", createdByName: "Cô Lan" });
    expect(job.nextAttemptAt).toBe(job.createdAt);
    expect(job.payload).toMatchObject({
      event: "CREATED",
      actorName: "Cô Lan",
      snapshot: { record: "incident", code: res.body.code, classCode: "6A01", errorCode: "L01", title: "Đi học muộn", points: 2, students: ["Học sinh A"], detail: "Cổng trường" },
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ kinds: ["NOTICE"], deadlineMs: NOTICE_DRAIN_MS, baseUrl: "http://localhost:3000" });
    expect(scheduled[0].builders.NOTICE).toBe(buildNoticeJob);
  });

  it("GVCN proposals never notify; confirming one (status into a counted status) → CONFIRMED", async () => {
    await saveSettings(ALL_ON);
    const proposal = await createRw(t.gvcn);
    expect(proposal.status).toBe(201);
    expect(proposal.body.proposed).toBe(true);
    expect(await noticesOf(proposal.body.id)).toEqual([]);
    expect(scheduled).toHaveLength(0);

    const verifying = await patchRw(t.admin, proposal.body.id, { status: "Đang xác minh" });
    expect(verifying.status).toBe(200);
    expect(await noticesOf(proposal.body.id)).toEqual([]);

    const confirmed = await patchRw(t.admin, proposal.body.id, { status: "Đã xác nhận" });
    expect(confirmed.status).toBe(200);
    const jobs = await noticesOf(proposal.body.id);
    expect(events(jobs)).toEqual(["CONFIRMED:6A01"]);
    expect(jobs[0].payload.snapshot).toMatchObject({ record: "reward", status: "Đã xác nhận", counted: true, points: 2 });
    expect(jobs[0].payload.actorName).toBe("Quản trị");

    expect((await patchRw(t.admin, proposal.body.id, { note: "Có minh chứng" })).status).toBe(200);
    expect(await noticesOf(proposal.body.id)).toHaveLength(1);
  });

  it("edits notify only for score-relevant changes; a class move → MOVED_OUT (old class) + CREATED (new class)", async () => {
    await saveSettings(ALL_ON);
    const created = await createInc(t.editor);
    const id = created.body.id;
    expect(events(await noticesOf(id))).toEqual(["CREATED:6A01"]);

    expect((await patchInc(t.editor, id, { detail: "Mô tả thêm", status: "Đang xử lý" })).status).toBe(200);
    expect(await noticesOf(id)).toHaveLength(1);

    expect((await patchInc(t.editor, id, { occurrenceCount: 2 })).status).toBe(200);
    const afterCount = await noticesOf(id);
    expect(events(afterCount)).toEqual(["CREATED:6A01", "UPDATED:6A01"]);
    expect(afterCount[1].payload.changes).toEqual(["Điểm trừ", "Số lần vi phạm"]);
    expect(afterCount[1].payload.snapshot.points).toBe(10);

    const moved = await patchInc(t.editor, id, { classCode: "6A02" });
    expect(moved.status).toBe(200);
    const all = await noticesOf(id);
    expect(all).toHaveLength(4);
    const tail = all.slice(2);
    expect(tail.map((j) => j.payload.event).sort()).toEqual(["CREATED", "MOVED_OUT"]);
    const out = tail.find((j) => j.payload.event === "MOVED_OUT");
    const into = tail.find((j) => j.payload.event === "CREATED");
    expect(out?.payload).toMatchObject({ movedTo: "6A02", snapshot: { classCode: "6A01" } });
    expect(into?.payload.snapshot.classCode).toBe("6A02");
  });

  it("delete → DELETED and restore → RESTORED, for incidents and rewards", async () => {
    await saveSettings(ALL_ON);
    const inc = (await createInc(t.admin)).body;
    const del = await callRoute(incDELETE, { method: "DELETE", url: `/api/incidents/${inc.id}`, token: t.admin, params: { id: inc.id }, body: { reason: "Ghi nhầm lớp" } });
    expect(del.status).toBe(200);
    const restored = await callRoute(incRestorePOST, { method: "POST", url: `/api/incidents/${inc.id}/restore`, token: t.admin, params: { id: inc.id } });
    expect(restored.status).toBe(200);
    expect((await noticesOf(inc.id)).map((j) => j.payload.event)).toEqual(["CREATED", "DELETED", "RESTORED"]);

    const rw = (await createRw(t.admin, { status: "Đã xác nhận" })).body;
    expect((await callRoute(rwDELETE, { method: "DELETE", url: `/api/rewards/${rw.id}`, token: t.admin, params: { id: rw.id }, body: { reason: "Trùng" } })).status).toBe(200);
    expect((await callRoute(rwRestorePOST, { method: "POST", url: `/api/rewards/${rw.id}/restore`, token: t.admin, params: { id: rw.id } })).status).toBe(200);
    const rwJobs = await noticesOf(rw.id);
    expect(rwJobs.map((j) => j.payload.event)).toEqual(["CREATED", "DELETED", "RESTORED"]);
    expect(rwJobs[1].payload.snapshot.counted).toBe(true);
  });

  it("GVCN feedback and service calls outside the routes (scripts, seeds) never notify", async () => {
    await saveSettings(ALL_ON);
    const inc = (await createInc(t.editor)).body;
    const fb = await callRoute(feedbackPOST, { method: "POST", url: `/api/incidents/${inc.id}/feedback`, token: t.gvcn, params: { id: inc.id }, body: { note: "Đã nhắc nhở lớp" } });
    expect(fb.status).toBe(200);
    expect(await noticesOf(inc.id)).toHaveLength(1);

    const direct = await createIncident({ user: adminUser }, IncidentCreateSchema.parse(incidentBody()));
    expect(direct.created).toBe(true);
    expect(await noticesOf(direct.incident.id)).toEqual([]);
  });

  it("the drain sends each notice to the class GVCN(s) and marks it SENT; no (allowed) address → SKIPPED", async () => {
    await saveSettings(ALL_ON, ["example.edu.vn"]);
    const own = (await createInc(t.editor)).body; // 6A01: GVCN account
    const homeroom = (await createInc(t.editor, { classCode: "6A02" })).body; // ClassInfo.homeroomEmail
    const nobody = (await createInc(t.editor, { classCode: "6A03" })).body;
    const outside = (await createInc(t.editor, { classCode: "6A04" })).body; // homeroom email outside the domains

    const result = await drainMail({ kinds: ["NOTICE"], builders: { NOTICE: buildNoticeJob }, deadlineMs: 120_000, baseUrl: BASE });
    expect(result.failed).toBe(0);
    expect(result.sent).toBeGreaterThanOrEqual(2);
    expect((await listDocs<MailJob>(COL.mailOutbox)).filter((j) => j.kind === "NOTICE" && j.status === "PENDING")).toEqual([]);

    const [ownJob] = await noticesOf(own.id);
    expect(ownJob).toMatchObject({ status: "SENT", attempts: 1, to: ["gv.6a01@example.edu.vn"], cc: [] });
    expect(ownJob.subject).toBe(`[Nền nếp] Lớp 6A01: −5 điểm · Lớp mất trật tự (${yesterday.split("-").reverse().join("/")})`);
    // Jobs left PENDING by earlier tests share subject and recipient: pick this record's mail by its code.
    const mail = sent.find((m) => m.subject === ownJob.subject && m.to[0] === "gv.6a01@example.edu.vn" && !!m.text?.includes(own.code));
    expect(mail).toBeDefined();
    expect(mail?.html).toContain(`${BASE}/lop?level=THCS&amp;mode=week&amp;key=${own.week}&amp;class=6A01`);

    expect((await noticesOf(homeroom.id))[0]).toMatchObject({ status: "SENT", to: ["gv.6a02@example.edu.vn"] });
    expect((await noticesOf(nobody.id))[0]).toMatchObject({ status: "SKIPPED", skipReason: NOTICE_JOB_MSG.noRecipient("6A03") });
    expect((await noticesOf(outside.id))[0]).toMatchObject({ status: "SKIPPED", skipReason: NOTICE_JOB_MSG.blocked("6A04", ["gv.6a04@gmail.test"]) });
    expect(sent.some((m) => [...m.to, ...m.cc].some((a) => a.endsWith("@gmail.test")))).toBe(false);
  });

  it("notices queued before notices were turned off are SKIPPED when drained", async () => {
    await saveSettings(ALL_ON);
    const inc = (await createInc(t.editor)).body;
    await saveSettings({ enabled: false, incidents: true, rewards: true });
    await drainMail({ kinds: ["NOTICE"], builders: { NOTICE: buildNoticeJob }, deadlineMs: 120_000, baseUrl: BASE });
    expect((await noticesOf(inc.id))[0]).toMatchObject({ status: "SKIPPED", skipReason: NOTICE_JOB_MSG.disabled });
    expect(sent).toEqual([]);
  });
});
