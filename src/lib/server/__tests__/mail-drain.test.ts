/**
 * drainMail on the Firestore emulator with a fake transport: SENT / backoff / FAILED / SKIPPED, leases, batches and
 * kinds, unconfigured mail, concurrent drains that never send a job twice (claims are transactions), and candidates
 * beyond the first page of the (newest-first) outbox.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAIL_JOB_MAX_ATTEMPTS } from "../../constants";
import { COL, mailJobId } from "../../firestore-paths";
import type { MailJob } from "../../types";
import { db } from "../firebase-admin";
import { DRAIN_MSG, DRAIN_QUERY_LIMIT, drainMail, setDrainIntervalForTests, type DrainOptions } from "../mail/drain";
import { JOB_STATE_MSG } from "../mail/job-state";
import { invalidateMailSettingsCache } from "../mail/settings";
import { TEST_MAIL_SUBJECT, buildTestJob } from "../mail/test-job";
import { setMailTransportForTests } from "../mail/transport";
import { MailSendError, type JobBuilder, type MailTransport, type OutgoingMail } from "../mail/types";
import { getDoc, listDocs, setupTestProject } from "./helpers";

const PROJECT = "demo-test-mail-drain";
const BASE = "https://nennep.example.edu.vn";

const sent: OutgoingMail[] = [];
let failFor: (mail: OutgoingMail) => Error | undefined = () => undefined;
let sendDelayMs = 0;
const fake: MailTransport = {
  configured: true,
  sender: "nennep@example.edu.vn",
  async send(mail) {
    if (sendDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, sendDelayMs));
    const err = failFor(mail);
    if (err) throw err;
    sent.push(mail);
  },
};

let n = 0;
async function insertJob(over: Partial<MailJob> = {}): Promise<MailJob> {
  n += 1;
  const now = Date.now();
  const job: MailJob = {
    id: mailJobId(now),
    levelId: "THCS",
    kind: "TEST",
    status: "PENDING",
    to: [`gv${n}@example.edu.vn`],
    cc: [],
    payload: { kind: "TEST" },
    attempts: 0,
    nextAttemptAt: new Date(now - 1000).toISOString(),
    createdAt: new Date(now).toISOString(),
    createdBy: "admin",
    createdByName: "Quản trị",
    ...over,
  };
  await db().collection(COL.mailOutbox).doc(job.id).set(job);
  return job;
}
const stored = async (id: string) => (await getDoc<MailJob>(COL.mailOutbox, id)) as MailJob;
const testDrain = (over: Partial<DrainOptions> = {}) => drainMail({ kinds: ["TEST"], builders: { TEST: buildTestJob }, deadlineMs: 60_000, baseUrl: BASE, ...over });

async function clearOutbox(): Promise<void> {
  const snap = await db().collection(COL.mailOutbox).get();
  const batch = db().batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}

describe("drainMail (emulator)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    invalidateMailSettingsCache();
    setMailTransportForTests(fake);
    setDrainIntervalForTests(0);
  });

  afterAll(() => {
    setMailTransportForTests(null);
    setDrainIntervalForTests(null);
    invalidateMailSettingsCache();
  });

  beforeEach(async () => {
    await clearOutbox();
    sent.length = 0;
    failFor = () => undefined;
    sendDelayMs = 0;
  });

  it("sends due jobs through the transport and marks them SENT (recipients, subject, sentAt, attempt 1)", async () => {
    const jobs = [await insertJob(), await insertJob({ cc: ["bgh@example.edu.vn"] }), await insertJob()];
    const result = await testDrain();
    expect(result).toEqual({ sent: 3, failed: 0, skipped: 0, retried: 0 });
    expect(sent).toHaveLength(3);
    for (const j of jobs) {
      const s = await stored(j.id);
      expect(s).toMatchObject({ status: "SENT", attempts: 1, to: j.to, cc: j.cc, subject: TEST_MAIL_SUBJECT });
      expect(Date.parse(s.sentAt ?? "")).not.toBeNaN();
      expect("leaseUntil" in s).toBe(false);
    }
    expect(await testDrain()).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(sent).toHaveLength(3);
  });

  it("retryable failure → PENDING with backoff; not retryable or last attempt → FAILED", async () => {
    const busy = await insertJob();
    const denied = await insertJob();
    const last = await insertJob({ attempts: MAIL_JOB_MAX_ATTEMPTS - 1 });
    failFor = (m) =>
      m.to[0] === denied.to[0]
        ? new MailSendError("Ứng dụng chưa được cấp quyền gửi thư từ hộp thư nennep@example.edu.vn", false, undefined, 403)
        : new MailSendError("Microsoft 365 tạm thời chưa nhận thư (HTTP 503) – hệ thống sẽ tự gửi lại.", true, undefined, 503);
    const before = Date.now();
    const result = await testDrain();
    expect(result).toEqual({ sent: 0, failed: 2, skipped: 0, retried: 1 });

    const b = await stored(busy.id);
    expect(b).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Microsoft 365 tạm thời chưa nhận thư (HTTP 503) – hệ thống sẽ tự gửi lại." });
    expect(Date.parse(b.nextAttemptAt)).toBeGreaterThanOrEqual(before + 60_000);
    expect("leaseUntil" in b).toBe(false);
    expect(await stored(denied.id)).toMatchObject({ status: "FAILED", attempts: 1, lastError: "Ứng dụng chưa được cấp quyền gửi thư từ hộp thư nennep@example.edu.vn" });
    expect(await stored(last.id)).toMatchObject({ status: "FAILED", attempts: MAIL_JOB_MAX_ATTEMPTS });

    // The backing-off job is not due yet: a second drain leaves it alone.
    failFor = () => undefined;
    expect(await testDrain()).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect((await stored(busy.id)).attempts).toBe(1);
  });

  it("two concurrent drains never send a job twice", async () => {
    const jobs = await Promise.all(Array.from({ length: 10 }, () => insertJob()));
    sendDelayMs = 20;
    const results = await Promise.all([testDrain(), testDrain(), testDrain()]);
    expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(10);
    expect(sent).toHaveLength(10);
    expect(new Set(sent.map((m) => m.to[0])).size).toBe(10);
    for (const j of jobs) expect(await stored(j.id)).toMatchObject({ status: "SENT", attempts: 1 });
  });

  it("re-claims a SENDING job whose lease expired; leaves a live lease alone; an interrupted TEST message is FAILED", async () => {
    const report: JobBuilder = async (j) => ({ mail: { to: j.to, cc: j.cc, subject: "[Nền nếp] Báo cáo", html: "<p>Báo cáo</p>" } });
    const expired = () => new Date(Date.now() - 1000).toISOString();
    const stuck = await insertJob({ kind: "REPORT", status: "SENDING", attempts: 1, leaseUntil: expired() });
    const live = await insertJob({ kind: "REPORT", status: "SENDING", attempts: 1, leaseUntil: new Date(Date.now() + 120_000).toISOString() });
    const test = await insertJob({ status: "SENDING", attempts: 1, leaseUntil: expired() });
    expect(await drainMail({ kinds: ["REPORT", "TEST"], builders: { REPORT: report, TEST: buildTestJob }, deadlineMs: 120_000, baseUrl: BASE })).toMatchObject({ sent: 1, failed: 1 });
    expect(await stored(stuck.id)).toMatchObject({ status: "SENT", attempts: 2 });
    expect(await stored(live.id)).toMatchObject({ status: "SENDING", attempts: 1 });
    expect(await stored(test.id)).toMatchObject({ status: "FAILED", attempts: 1, lastError: JOB_STATE_MSG.testInterrupted });
    expect(sent.map((m) => m.to[0])).toEqual(stuck.to);
  });

  it("finds a due job behind a full page of newer jobs that are still backing off (no starvation)", async () => {
    const now = Date.now();
    const old = await insertJob({ id: mailJobId(now - 3_600_000), createdAt: new Date(now - 3_600_000).toISOString(), attempts: 2 });
    const batch = db().batch();
    for (let i = 0; i < DRAIN_QUERY_LIMIT + 5; i++) {
      const id = mailJobId(now + i);
      const backingOff: MailJob = { ...old, id, to: [`moi${i}@example.edu.vn`], attempts: 1, nextAttemptAt: new Date(now + 600_000).toISOString(), createdAt: new Date(now + i).toISOString() };
      batch.set(db().collection(COL.mailOutbox).doc(id), backingOff);
    }
    await batch.commit();
    expect(await testDrain()).toEqual({ sent: 1, failed: 0, skipped: 0, retried: 0 });
    expect(sent.map((m) => m.to[0])).toEqual(old.to);
    expect(await stored(old.id)).toMatchObject({ status: "SENT", attempts: 3 });
  });

  it("a batch drain only touches its batch; other kinds stay PENDING", async () => {
    const report: JobBuilder = async (j) => ({ mail: { to: j.to, cc: j.cc, subject: "[Nền nếp] Báo cáo", html: "<p>Báo cáo</p>" } });
    const mine = await insertJob({ kind: "REPORT", batchId: "batch-1" });
    const other = await insertJob({ kind: "REPORT", batchId: "batch-2" });
    const test = await insertJob();
    const result = await drainMail({ kinds: ["REPORT"], batchId: "batch-1", builders: { REPORT: report }, deadlineMs: 120_000, baseUrl: BASE });
    expect(result.sent).toBe(1);
    expect((await stored(mine.id)).status).toBe("SENT");
    expect((await stored(other.id)).status).toBe("PENDING");
    expect((await stored(test.id)).status).toBe("PENDING");
  });

  it("recipients outside the allowed domains are dropped; none left → SKIPPED", async () => {
    const outside = await insertJob({ to: ["gv@gmail.test"] });
    const mixed = await insertJob({ to: ["gv.ok@example.edu.vn", "gv@gmail.test"], cc: ["bgh@other.test"] });
    const result = await testDrain();
    expect(result).toMatchObject({ sent: 1, skipped: 1 });
    expect(await stored(outside.id)).toMatchObject({ status: "SKIPPED", skipReason: DRAIN_MSG.noAllowedRecipient(["example.edu.vn"], ["gv@gmail.test"]) });
    expect(await stored(mixed.id)).toMatchObject({ status: "SENT", to: ["gv.ok@example.edu.vn"], cc: [] });
    expect(sent.flatMap((m) => [...m.to, ...m.cc])).toEqual(["gv.ok@example.edu.vn"]);
  });

  it("claims nothing while mail is not configured", async () => {
    const j = await insertJob();
    setMailTransportForTests(null);
    try {
      expect(await testDrain()).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    } finally {
      setMailTransportForTests(fake);
    }
    expect(await stored(j.id)).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(await listDocs<MailJob>(COL.mailOutbox)).toHaveLength(1);
  });
});
