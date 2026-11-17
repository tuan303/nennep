/**
 * runDrain with an in-memory outbox, a fake clock and a fake transport (no emulators): outcomes, backoff, allowed
 * domains, pacing, deadline (anchored start, per-kind claim reserve, pre-send check, release), retries inside the
 * drain once a backoff ends (batch drains: any job of the batch; school-wide drains: only the jobs they claimed, so
 * concurrent drains never wake together), batches / kinds, concurrent drains, interrupted jobs, cleanup callbacks;
 * the notice catch-up drain of the routes.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAIL_JOB_MAX_ATTEMPTS } from "../../constants";
import type { MailJob } from "../../types";
import { MAIL_RETRY_DELAYS_MS } from "../../mail/policy";
import {
  DRAIN_CLAIM_RESERVE_MS,
  LEASE_SEND_MARGIN_MS,
  LONG_DRAIN_MS,
  MAIL_SEND_INTERVAL_MS,
  SEND_MIN_BUDGET_MS,
  assertTimeToSend,
  nextRetryAt,
  restrictToDomains,
  runDrain,
  scheduleDrain,
  setDrainSchedulerForTests,
  type DrainDeps,
  type DrainOptions,
  type OutboxStore,
} from "../mail/drain";
import { JOB_STATE_MSG, MAIL_LEASE_MS, claimJob } from "../mail/job-state";
import {
  NOTICE_DRAIN_MS,
  OVERDUE_NOTICE_CHECK_MS,
  noticeDrainCanClaim,
  noticeHooks,
  overdueNoticeTask,
  resetNoticeDrainThrottleForTests,
  scheduleNoticeCatchUp,
  scheduleNoticeDrain,
} from "../mail/notice-drain";
import { buildNoticeJob } from "../mail/outbox";
import { setMailTransportForTests } from "../mail/transport";
import { MailSendError, OutOfTimeError, type JobBuilder, type MailTransport, type OutgoingMail, type SendOptions } from "../mail/types";

const T0 = Date.parse("2026-10-21T03:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const DOMAIN = "example.edu.vn";

let seq = 0;
function job(over: Partial<MailJob> = {}): MailJob {
  seq += 1;
  const created = T0 - 100_000 + seq;
  return {
    id: `${String(9_999_999_999_999 - created).padStart(13, "0")}_${String(seq).padStart(8, "0")}`,
    levelId: "THCS",
    kind: "TEST",
    status: "PENDING",
    to: [`gv${seq}@${DOMAIN}`],
    cc: [],
    payload: { kind: "TEST" },
    attempts: 0,
    nextAttemptAt: iso(T0 - 1),
    createdAt: iso(created),
    createdBy: "admin",
    createdByName: "Quản trị",
    ...over,
  };
}

const clone = (j: MailJob): MailJob => structuredClone(j);

/** Claim / finish are atomic (no await between the check and the write), like the Firestore transactions. */
function memoryOutbox(jobs: MailJob[]): { store: OutboxStore; get: (id: string) => MailJob } {
  const map = new Map(jobs.map((j) => [j.id, clone(j)]));
  const store: OutboxStore = {
    async candidates({ kinds, batchId, limit }) {
      await Promise.resolve();
      const all = [...map.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
      if (batchId) return all.filter((j) => j.batchId === batchId).map(clone);
      return (["PENDING", "SENDING"] as const).flatMap((st) => all.filter((j) => j.status === st && kinds.includes(j.kind)).slice(0, limit)).map(clone);
    },
    async claim(id, nowMs) {
      await Promise.resolve();
      const current = map.get(id);
      if (!current) return null;
      const r = claimJob(current, nowMs);
      if (r) map.set(id, clone(r.job));
      return r ? { kind: r.kind, job: clone(r.job) } : null;
    },
    async finish(claimed, next) {
      await Promise.resolve();
      const current = map.get(claimed.id);
      if (!current || current.status !== "SENDING" || current.leaseUntil !== claimed.leaseUntil) return false;
      map.set(claimed.id, clone(next));
      return true;
    },
  };
  return { store, get: (id) => clone(map.get(id) as MailJob) };
}

interface FakeTransport extends MailTransport {
  sent: OutgoingMail[];
  /** Options of every send call. */
  options: Array<SendOptions | undefined>;
}

function fakeTransport(opts: { configured?: boolean; fail?: (mail: OutgoingMail) => Error | undefined; onSend?: () => Promise<void> | void } = {}): FakeTransport {
  const sent: OutgoingMail[] = [];
  const options: Array<SendOptions | undefined> = [];
  return {
    configured: opts.configured ?? true,
    sender: `nennep@${DOMAIN}`,
    sent,
    options,
    async send(mail, sendOpts) {
      options.push(sendOpts);
      await opts.onSend?.();
      const err = opts.fail?.(mail);
      if (err) throw err;
      sent.push(mail);
    },
  };
}

function deps(store: OutboxStore, transport: MailTransport, clock: { t: number }, over: Partial<DrainDeps> = {}): DrainDeps & { sleeps: number[] } {
  const sleeps: number[] = [];
  return {
    store,
    transport,
    allowedDomains: async () => [DOMAIN],
    now: () => clock.t,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.t += ms;
    },
    minIntervalMs: MAIL_SEND_INTERVAL_MS,
    sleeps,
    ...over,
  };
}

interface Wake {
  who: string;
  /** Virtual time the sleep ended. */
  at: number;
  ms: number;
}

/**
 * Virtual time shared by concurrent drains (store and transport settle in microtasks only): `run` lets every drain go
 * on until it sleeps or ends, then moves the clock to the earliest sleep's end and wakes that drain; repeat.
 */
function sharedClock(start: number) {
  const clock = { t: start };
  const timers: Array<Wake & { resolve: () => void }> = [];
  const wakes: Wake[] = [];
  const depsOf = (who: string, store: OutboxStore, transport: MailTransport): DrainDeps => ({
    store,
    transport,
    allowedDomains: async () => [DOMAIN],
    now: () => clock.t,
    sleep: (ms) => new Promise<void>((resolve) => void timers.push({ who, at: clock.t + ms, ms, resolve })),
    minIntervalMs: MAIL_SEND_INTERVAL_MS,
  });
  async function run<T>(tasks: Array<Promise<T>>): Promise<T[]> {
    let settled = false;
    const all = Promise.all(tasks).finally(() => {
      settled = true;
    });
    for (;;) {
      await new Promise<void>((resolve) => setImmediate(resolve)); // every microtask ran: each drain sleeps or ended
      if (settled) return all;
      timers.sort((x, y) => x.at - y.at); // stable: equal ends wake in the order the drains went to sleep
      const next = timers.shift();
      if (!next) throw new Error("a drain is stuck without sleeping");
      clock.t = Math.max(clock.t, next.at);
      wakes.push({ who: next.who, at: next.at, ms: next.ms });
      next.resolve();
    }
  }
  return { clock, deps: depsOf, run, wakes };
}

const testBuilder: JobBuilder = async (j) => ({ mail: { to: j.to, cc: j.cc, subject: `Thư ${j.id}`, html: "<p>Thử</p>" } });
const opts = (over: Partial<DrainOptions> = {}): DrainOptions => ({ kinds: ["TEST"], builders: { TEST: testBuilder }, deadlineMs: 120_000, baseUrl: "https://nennep.example.edu.vn", ...over });

describe("runDrain – outcomes", () => {
  it("sends due jobs oldest first and marks them SENT with recipients, subject and sentAt", async () => {
    const jobs = [job(), job(), job({ cc: [`bgh@${DOMAIN}`] })];
    const { store, get } = memoryOutbox(jobs);
    const transport = fakeTransport();
    const clock = { t: T0 };
    const result = await runDrain(opts(), deps(store, transport, clock));
    expect(result).toEqual({ sent: 3, failed: 0, skipped: 0, retried: 0 });
    expect(transport.sent.map((m) => m.to[0])).toEqual(jobs.map((j) => j.to[0]));
    for (const j of jobs) {
      const stored = get(j.id);
      expect(stored).toMatchObject({ status: "SENT", attempts: 1, to: j.to, cc: j.cc, subject: `Thư ${j.id}` });
      expect(stored.sentAt).toBeDefined();
      expect("leaseUntil" in stored).toBe(false);
    }
  });

  it("retryable error → PENDING with backoff; not retryable → FAILED; builder skip → SKIPPED; builder crash → retried", async () => {
    const busy = job();
    const denied = job();
    const skip = job({ kind: "NOTICE", payload: { kind: "TEST" } });
    const crash = job({ kind: "REPORT", payload: { kind: "TEST" } });
    const lastTry = job({ attempts: MAIL_JOB_MAX_ATTEMPTS - 1 });
    const { store, get } = memoryOutbox([busy, denied, skip, crash, lastTry]);
    const transport = fakeTransport({
      fail: (m) =>
        m.to[0] === busy.to[0] || m.to[0] === lastTry.to[0]
          ? // Retry-After beyond this drain: the job stays PENDING (retries inside the drain are covered below).
            new MailSendError("Microsoft 365 tạm thời chưa nhận thư (HTTP 503)", true, 600_000, 503)
          : m.to[0] === denied.to[0]
            ? new MailSendError("Ứng dụng chưa được cấp quyền", false, undefined, 403)
            : undefined,
    });
    const clock = { t: T0 };
    const result = await runDrain(
      opts({
        kinds: ["TEST", "NOTICE", "REPORT"],
        builders: {
          TEST: testBuilder,
          NOTICE: async () => ({ skip: "Lớp 6A01 chưa có email GVCN" }),
          REPORT: async () => {
            throw new Error("chromium crashed");
          },
        },
      }),
      deps(store, transport, clock),
    );
    expect(result).toEqual({ sent: 0, failed: 2, skipped: 1, retried: 2 });
    const b = get(busy.id);
    expect(b).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Microsoft 365 tạm thời chưa nhận thư (HTTP 503)" });
    expect(Date.parse(b.nextAttemptAt)).toBeGreaterThanOrEqual(T0 + 600_000); // Retry-After honoured (> the 1 min backoff)
    expect(get(denied.id)).toMatchObject({ status: "FAILED", attempts: 1, lastError: "Ứng dụng chưa được cấp quyền" });
    expect(get(skip.id)).toMatchObject({ status: "SKIPPED", skipReason: "Lớp 6A01 chưa có email GVCN" });
    expect(get(crash.id)).toMatchObject({ status: "PENDING", lastError: JOB_STATE_MSG.unexpected("chromium crashed") });
    expect(get(lastTry.id)).toMatchObject({ status: "FAILED", attempts: MAIL_JOB_MAX_ATTEMPTS });
  });

  it("a job backing off is not sent again before its nextAttemptAt", async () => {
    const later = job({ nextAttemptAt: iso(T0 + 60_000), attempts: 1 });
    const { store, get } = memoryOutbox([later]);
    const transport = fakeTransport();
    // 60 s budget: the backoff ends after the last moment a TEST job may be claimed (deadline − 30 s) → no wait.
    const d = deps(store, transport, { t: T0 });
    expect(await runDrain(opts({ deadlineMs: 60_000 }), d)).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(d.sleeps).toEqual([]);
    expect(get(later.id).status).toBe("PENDING");
    expect(await runDrain(opts({ deadlineMs: 60_000 }), deps(store, transport, { t: T0 + 60_000 }))).toMatchObject({ sent: 1 });
    expect(get(later.id)).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("drops recipients outside the allowed domains; nothing left in `to` → SKIPPED with the blocked addresses", async () => {
    const mixed = job({ to: [`gv@${DOMAIN}`, "gv@gmail.test"], cc: ["bgh@other.test", `gv@${DOMAIN}`] });
    const outside = job({ to: ["gv@gmail.test"], cc: [`bgh@${DOMAIN}`] });
    const { store, get } = memoryOutbox([mixed, outside]);
    const transport = fakeTransport();
    const result = await runDrain(opts(), deps(store, transport, { t: T0 }));
    expect(result).toMatchObject({ sent: 1, skipped: 1 });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ to: [`gv@${DOMAIN}`], cc: [] });
    expect(get(mixed.id)).toMatchObject({ status: "SENT", to: [`gv@${DOMAIN}`], cc: [] });
    expect(get(outside.id)).toMatchObject({ status: "SKIPPED", skipReason: `Không có người nhận thuộc tên miền được phép (${DOMAIN}): đã bỏ gv@gmail.test.` });
  });

  it("does nothing when the transport is not configured or no builder matches", async () => {
    const j = job();
    const { store, get } = memoryOutbox([j]);
    expect(await runDrain(opts(), deps(store, fakeTransport({ configured: false }), { t: T0 }))).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(await runDrain(opts({ builders: {} }), deps(store, fakeTransport(), { t: T0 }))).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(get(j.id)).toMatchObject({ status: "PENDING", attempts: 0 });
  });
});

describe("runDrain – scheduling", () => {
  it("keeps ≥ 2.2 s between two sends", async () => {
    const { store } = memoryOutbox([job(), job(), job()]);
    const clock = { t: T0 };
    const d = deps(store, fakeTransport(), clock);
    await runDrain(opts(), d);
    expect(d.sleeps).toEqual([MAIL_SEND_INTERVAL_MS, MAIL_SEND_INTERVAL_MS]);
  });

  it("stops claiming when less than the claim reserve of the kind remains before the deadline (the rest stays PENDING)", async () => {
    const jobs = [job(), job(), job(), job()];
    const { store, get } = memoryOutbox(jobs);
    const clock = { t: T0 };
    const transport = fakeTransport({
      onSend: () => {
        clock.t += 3_000;
      },
    });
    const result = await runDrain(opts({ deadlineMs: DRAIN_CLAIM_RESERVE_MS.TEST + 5_000 }), deps(store, transport, clock));
    expect(result.sent).toBe(2);
    expect(get(jobs[2].id)).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(get(jobs[3].id)).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("drains only the given batch / kinds", async () => {
    const mine = job({ kind: "REPORT", batchId: "batch-1", payload: { kind: "TEST" } });
    const other = job({ kind: "REPORT", batchId: "batch-2", payload: { kind: "TEST" } });
    const notice = job({ kind: "NOTICE", payload: { kind: "TEST" } });
    const { store, get } = memoryOutbox([mine, other, notice]);
    const builders = { REPORT: testBuilder, NOTICE: testBuilder };
    const transport = fakeTransport();
    expect((await runDrain(opts({ kinds: ["REPORT"], batchId: "batch-1", builders }), deps(store, transport, { t: T0 }))).sent).toBe(1);
    expect(get(mine.id).status).toBe("SENT");
    expect(get(other.id).status).toBe("PENDING");
    expect(get(notice.id).status).toBe("PENDING");
    expect((await runDrain(opts({ kinds: ["NOTICE"], builders }), deps(store, transport, { t: T0 }))).sent).toBe(1);
    expect(get(other.id).status).toBe("PENDING");
  });

  it("re-claims a job whose lease expired; an interrupted job without attempts left is FAILED", async () => {
    const stuck = job({ kind: "NOTICE", status: "SENDING", attempts: 1, leaseUntil: iso(T0 - 1) });
    const live = job({ kind: "NOTICE", status: "SENDING", attempts: 1, leaseUntil: iso(T0 + 60_000) });
    const exhausted = job({ kind: "NOTICE", status: "SENDING", attempts: MAIL_JOB_MAX_ATTEMPTS, leaseUntil: iso(T0 - 1) });
    const { store, get } = memoryOutbox([stuck, live, exhausted]);
    const result = await runDrain(opts({ kinds: ["NOTICE"], builders: { NOTICE: testBuilder } }), deps(store, fakeTransport(), { t: T0 }));
    expect(result).toEqual({ sent: 1, failed: 1, skipped: 0, retried: 0 });
    expect(get(stuck.id)).toMatchObject({ status: "SENT", attempts: 2 });
    expect(get(live.id)).toMatchObject({ status: "SENDING", attempts: 1 });
    expect(get(exhausted.id)).toMatchObject({ status: "FAILED", lastError: JOB_STATE_MSG.interrupted });
  });

  it("an interrupted TEST message is FAILED, never sent hours later", async () => {
    const stuck = job({ status: "SENDING", attempts: 1, leaseUntil: iso(T0 - 1) });
    const { store, get } = memoryOutbox([stuck]);
    const transport = fakeTransport();
    expect(await runDrain(opts(), deps(store, transport, { t: T0 }))).toEqual({ sent: 0, failed: 1, skipped: 0, retried: 0 });
    expect(transport.sent).toEqual([]);
    expect(get(stuck.id)).toMatchObject({ status: "FAILED", attempts: 1, lastError: JOB_STATE_MSG.testInterrupted });
  });

  it("two concurrent drains never send a job twice", async () => {
    const jobs = Array.from({ length: 8 }, () => job());
    const { store, get } = memoryOutbox(jobs);
    const transport = fakeTransport({ onSend: () => new Promise<void>((resolve) => setTimeout(resolve, 1)) });
    const clock = { t: T0 };
    const noPacing = { minIntervalMs: 0 };
    const [a, b] = await Promise.all([runDrain(opts(), deps(store, transport, clock, noPacing)), runDrain(opts(), deps(store, transport, clock, noPacing))]);
    expect(a.sent + b.sent).toBe(8);
    expect(transport.sent).toHaveLength(8);
    expect(new Set(transport.sent.map((m) => m.subject)).size).toBe(8);
    for (const j of jobs) expect(get(j.id)).toMatchObject({ status: "SENT", attempts: 1 });
  });

  it("shares one cache per drain between builders and runs onFinish callbacks once at the end", async () => {
    const { store } = memoryOutbox([job(), job()]);
    const events: string[] = [];
    let builds = 0;
    const builder: JobBuilder = async (j, ctx) => {
      builds += 1;
      if (!ctx.cache.has("browser")) {
        ctx.cache.set("browser", "open");
        ctx.onFinish(async () => {
          events.push("close");
        });
      }
      expect(ctx.baseUrl).toBe("https://nennep.example.edu.vn");
      return { mail: { to: j.to, cc: [], subject: "x", html: "<p>x</p>" } };
    };
    await runDrain(opts({ builders: { TEST: builder } }), deps(store, fakeTransport(), { t: T0 }));
    expect(builds).toBe(2);
    expect(events).toEqual(["close"]);
  });
});

describe("runDrain – retries inside the drain", () => {
  const busy = () => new MailSendError("Microsoft 365 tạm thời chưa nhận thư (HTTP 503) – hệ thống sẽ tự gửi lại.", true, undefined, 503);

  it("a job that fails retryably is claimed again by the same drain once its backoff ends, never before", async () => {
    const j = job();
    const { store, get } = memoryOutbox([j]);
    const clock = { t: T0 };
    const sendTimes: number[] = [];
    let calls = 0;
    const transport = fakeTransport({
      onSend: () => void sendTimes.push(clock.t),
      fail: () => (++calls === 1 ? busy() : undefined),
    });
    const d = deps(store, transport, clock);
    const result = await runDrain(opts({ deadlineMs: LONG_DRAIN_MS }), d);
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0, retried: 1 });
    expect(get(j.id)).toMatchObject({ status: "SENT", attempts: 2 });
    expect(sendTimes).toEqual([T0, T0 + MAIL_RETRY_DELAYS_MS[0]]);
    expect(d.sleeps).toEqual([MAIL_RETRY_DELAYS_MS[0]]);
  });

  it("REPORT batch (the “Gửi” dialog may be closed): a failed render is retried by the batch's own drain after 1 min", async () => {
    const mine = [job({ kind: "REPORT", batchId: "b1" }), job({ kind: "REPORT", batchId: "b1" })];
    const other = job({ kind: "REPORT", batchId: "b2", nextAttemptAt: iso(T0 + 10_000), attempts: 1 });
    const { store, get } = memoryOutbox([...mine, other]);
    const clock = { t: T0 };
    let renders = 0;
    const report: JobBuilder = async (j) => {
      renders += 1;
      if (renders === 1) throw new MailSendError("Chưa tạo được file PDF của báo cáo – hệ thống sẽ thử lại.", true);
      return { mail: { to: j.to, cc: [], subject: `Báo cáo ${j.id}`, html: "<p>Báo cáo</p>" } };
    };
    const d = deps(store, fakeTransport(), clock);
    const result = await runDrain(opts({ kinds: ["REPORT"], batchId: "b1", builders: { REPORT: report }, deadlineMs: LONG_DRAIN_MS }), d);
    expect(result).toEqual({ sent: 2, failed: 0, skipped: 0, retried: 1 });
    expect(get(mine[0].id)).toMatchObject({ status: "SENT", attempts: 2 });
    expect(get(mine[1].id)).toMatchObject({ status: "SENT", attempts: 1 });
    // The job of another batch (due earlier) neither woke the drain up nor was sent.
    expect(get(other.id)).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(clock.t).toBeGreaterThanOrEqual(T0 + MAIL_RETRY_DELAYS_MS[0]);
    expect(d.sleeps.filter((ms) => ms !== MAIL_SEND_INTERVAL_MS)).toEqual([MAIL_RETRY_DELAYS_MS[0]]);
  });

  it("no wait when the backoff ends too late for the claim reserve of the kind: the drain ends", async () => {
    const report = job({ kind: "REPORT", batchId: "b1" });
    const { store, get } = memoryOutbox([report]);
    const clock = { t: T0 };
    const failing: JobBuilder = async () => {
      throw new MailSendError("Chưa tạo được file PDF của báo cáo – hệ thống sẽ thử lại.", true);
    };
    // 1 min backoff, but a REPORT needs 90 s before the 120 s deadline: last claim at T0 + 30 s.
    const d = deps(store, fakeTransport(), clock);
    expect(await runDrain(opts({ kinds: ["REPORT"], batchId: "b1", builders: { REPORT: failing }, deadlineMs: 120_000 }), d)).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
      retried: 1,
    });
    expect(d.sleeps).toEqual([]);
    expect(get(report.id)).toMatchObject({ status: "PENDING", attempts: 1, nextAttemptAt: iso(T0 + MAIL_RETRY_DELAYS_MS[0]) });
  });

  it("never loops on one job: each re-claim counts an attempt and waits for its (growing) backoff", async () => {
    const j = job();
    const { store, get } = memoryOutbox([j]);
    const clock = { t: T0 };
    const transport = fakeTransport({ fail: () => busy() });
    const d = deps(store, transport, clock);
    const result = await runDrain(opts({ deadlineMs: LONG_DRAIN_MS }), d);
    // Attempt 1 at T0, attempt 2 after 1 min; the next backoff (5 min) ends after the drain.
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 2 });
    expect(transport.options).toHaveLength(2);
    expect(get(j.id)).toMatchObject({ status: "PENDING", attempts: 2, nextAttemptAt: iso(T0 + MAIL_RETRY_DELAYS_MS[0] + MAIL_RETRY_DELAYS_MS[1]) });
    expect(d.sleeps).toEqual([MAIL_RETRY_DELAYS_MS[0]]);
    expect(clock.t).toBeLessThan(T0 + LONG_DRAIN_MS);
  });

  it("a batch drain waits for a job of its batch that an earlier drain put back, and claims it when due", async () => {
    const later = job({ kind: "REPORT", batchId: "b1", attempts: 1, nextAttemptAt: iso(T0 + 25_000), lastError: "HTTP 503" });
    const { store, get } = memoryOutbox([later]);
    const clock = { t: T0 };
    const d = deps(store, fakeTransport(), clock);
    const result = await runDrain(opts({ kinds: ["REPORT"], batchId: "b1", builders: { REPORT: testBuilder }, deadlineMs: LONG_DRAIN_MS }), d);
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0, retried: 0 });
    expect(d.sleeps).toEqual([25_000]);
    expect(get(later.id)).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("a school-wide drain never waits for a job another drain put back: it ends, the next drain sends the job once due", async () => {
    const later = job({ kind: "NOTICE", attempts: 1, nextAttemptAt: iso(T0 + 25_000), lastError: "HTTP 503" });
    const { store, get } = memoryOutbox([later]);
    const transport = fakeTransport();
    const noticeOpts = opts({ kinds: ["NOTICE"], builders: { NOTICE: testBuilder }, deadlineMs: NOTICE_DRAIN_MS });
    // Notice drain of a route: 50 s, could claim until deadline − 20 s = T0 + 30 s – but the job is not its own.
    const d = deps(store, transport, { t: T0 });
    expect(await runDrain(noticeOpts, d)).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(d.sleeps).toEqual([]);
    expect(transport.sent).toEqual([]);
    expect(get(later.id)).toMatchObject({ status: "PENDING", attempts: 1, nextAttemptAt: iso(T0 + 25_000) });
    // The catch-up drain of a later request (or the cron) sends it.
    expect(await runDrain(noticeOpts, deps(store, transport, { t: T0 + 25_000 }))).toMatchObject({ sent: 1 });
    expect(get(later.id)).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("two school-wide drains on one store (shared clock): only the drain that claimed a job wakes when its backoff ends", async () => {
    const vt = sharedClock(T0);
    const flaky = job({ kind: "NOTICE" });
    const others = [job({ kind: "NOTICE" }), job({ kind: "NOTICE" }), job({ kind: "NOTICE" })];
    const { store, get } = memoryOutbox([flaky, ...others]);
    const flakySends: number[] = [];
    let flakyCalls = 0;
    const transport = fakeTransport({
      fail: (m) => {
        if (m.to[0] !== flaky.to[0]) return undefined;
        flakySends.push(vt.clock.t);
        return ++flakyCalls === 1 ? busy() : undefined;
      },
    });
    // E.g. the 280 s drain of a "Gửi lại" and the cron: the 1 min backoff ends inside both claim windows.
    const noticeOpts = opts({ kinds: ["NOTICE"], builders: { NOTICE: testBuilder }, deadlineMs: LONG_DRAIN_MS });
    const [a, b] = await vt.run([runDrain(noticeOpts, vt.deps("a", store, transport)), runDrain(noticeOpts, vt.deps("b", store, transport))]);
    expect(a.sent + b.sent).toBe(4);
    expect(a.retried + b.retried).toBe(1);
    expect(transport.sent).toHaveLength(4);
    expect(new Set(transport.sent.map((m) => m.subject)).size).toBe(4);
    expect(get(flaky.id)).toMatchObject({ status: "SENT", attempts: 2 });
    for (const j of others) expect(get(j.id)).toMatchObject({ status: "SENT", attempts: 1 });
    // The first attempt failed at T0; the retry went out when the backoff ended …
    const retryAt = T0 + MAIL_RETRY_DELAYS_MS[0];
    expect(flakySends).toEqual([T0, retryAt]);
    // … and exactly one drain woke for it (both did before: two sendMail requests at the same millisecond).
    const backoffWakes = vt.wakes.filter((w) => w.at === retryAt);
    expect(backoffWakes).toHaveLength(1);
    // No other sleep than the pacing between two sends of one drain.
    expect(vt.wakes.filter((w) => w.at !== retryAt).every((w) => w.ms === MAIL_SEND_INTERVAL_MS)).toBe(true);
  });

  it("the wait counts from the end of the candidates query: the drain wakes exactly when the backoff ends", async () => {
    const j = job();
    const memory = memoryOutbox([j]);
    const clock = { t: T0 };
    const QUERY_MS = 3_000;
    const slowStore: OutboxStore = {
      ...memory.store,
      async candidates(q) {
        const jobs = await memory.store.candidates(q);
        clock.t += QUERY_MS; // a slow Firestore query
        return jobs;
      },
    };
    const sendTimes: number[] = [];
    let calls = 0;
    const transport = fakeTransport({ onSend: () => void sendTimes.push(clock.t), fail: () => (++calls === 1 ? busy() : undefined) });
    const d = deps(slowStore, transport, clock);
    expect(await runDrain(opts({ deadlineMs: LONG_DRAIN_MS }), d)).toEqual({ sent: 1, failed: 0, skipped: 0, retried: 1 });
    // 1st pass: query → T0 + 3 s, send fails (backoff until T0 + 63 s). 2nd pass: query → T0 + 6 s, sleep 57 s.
    const backoffEnd = T0 + QUERY_MS + MAIL_RETRY_DELAYS_MS[0];
    expect(d.sleeps).toEqual([backoffEnd - (T0 + 2 * QUERY_MS)]);
    // 3rd pass at the backoff end: query → + 3 s, claim and send.
    expect(sendTimes).toEqual([T0 + QUERY_MS, backoffEnd + QUERY_MS]);
    expect(memory.get(j.id)).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("nextRetryAt: earliest future backoff of a PENDING job that still leaves the claim reserve of its kind", () => {
    const deadline = T0 + 100_000;
    const at = (kind: MailJob["kind"], ms: number, over: Partial<MailJob> = {}) => job({ kind, nextAttemptAt: iso(T0 + ms), ...over });
    expect(nextRetryAt([], deadline, T0)).toBeUndefined();
    expect(nextRetryAt([at("NOTICE", 50_000), at("NOTICE", 30_000)], deadline, T0)).toBe(T0 + 30_000);
    expect(nextRetryAt([at("NOTICE", 80_000)], deadline, T0)).toBe(T0 + 80_000); // = deadline − 20 s
    expect(nextRetryAt([at("NOTICE", 80_001)], deadline, T0)).toBeUndefined();
    expect(nextRetryAt([at("REPORT", 10_001)], deadline, T0)).toBeUndefined(); // REPORT: deadline − 90 s
    expect(nextRetryAt([at("TEST", 0), at("TEST", -5_000)], deadline, T0)).toBeUndefined(); // due already
    expect(nextRetryAt([at("NOTICE", 10_000, { status: "SENDING", leaseUntil: iso(T0 + 10_000) })], deadline, T0)).toBeUndefined();
    expect(nextRetryAt([at("NOTICE", 10_000, { status: "SENT" })], deadline, T0)).toBeUndefined();
  });

  it("a transport that cannot start its request in time (OutOfTimeError) releases the job: attempt not counted", async () => {
    const j = job({ kind: "NOTICE", attempts: 1, lastError: "Lần trước lỗi" });
    const next = job({ kind: "NOTICE" });
    const { store, get } = memoryOutbox([j, next]);
    const clock = { t: T0 };
    const transport = fakeTransport({ fail: () => new OutOfTimeError("not enough time left to start a Microsoft Graph request") });
    const result = await runDrain(opts({ kinds: ["NOTICE"], builders: { NOTICE: testBuilder }, deadlineMs: NOTICE_DRAIN_MS }), deps(store, transport, clock));
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(get(j.id)).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Lần trước lỗi", nextAttemptAt: iso(clock.t) });
    expect(get(next.id)).toMatchObject({ status: "PENDING", attempts: 0 }); // the drain stopped
  });
});

describe("restrictToDomains", () => {
  it("keeps allowed recipients, never repeats a `to` address in cc, lists the blocked ones once", () => {
    const r = restrictToDomains({ to: ["A@Example.edu.vn", "x@gmail.test"], cc: ["a@example.edu.vn", "x@gmail.test", "b@example.edu.vn"], subject: "s", html: "h" }, [DOMAIN]);
    expect(r.mail.to).toEqual(["a@example.edu.vn"]);
    expect(r.mail.cc).toEqual(["b@example.edu.vn"]);
    expect(r.blocked).toEqual(["x@gmail.test"]);
  });
});

describe("scheduleDrain", () => {
  afterEach(() => {
    setDrainSchedulerForTests(null);
    setMailTransportForTests(null);
  });

  it("is a no-op while mail is not configured", () => {
    const seen: DrainOptions[] = [];
    setDrainSchedulerForTests((o) => seen.push(o));
    setMailTransportForTests(fakeTransport({ configured: false }));
    scheduleDrain(opts());
    scheduleNoticeDrain();
    expect(seen).toEqual([]);
  });

  it("hands the options to the scheduler; the notice drain of a route uses the request origin as base URL", () => {
    const seen: DrainOptions[] = [];
    setDrainSchedulerForTests((o) => seen.push(o));
    setMailTransportForTests(fakeTransport());
    scheduleDrain(opts({ batchId: "b1" }));
    noticeHooks(new NextRequest("https://preview.example.test/api/incidents")).onMailQueued();
    expect(seen).toHaveLength(2);
    expect(seen[0].batchId).toBe("b1");
    expect(seen[1]).toEqual({ kinds: ["NOTICE"], builders: { NOTICE: buildNoticeJob }, deadlineMs: NOTICE_DRAIN_MS, startedAt: expect.any(Number), baseUrl: "https://preview.example.test" });
  });

  it("the notice drain of a route counts its deadline from the start of the request (noticeHooks)", () => {
    const seen: DrainOptions[] = [];
    setDrainSchedulerForTests((o) => seen.push(o));
    setMailTransportForTests(fakeTransport());
    const before = Date.now();
    const hooks = noticeHooks(new NextRequest("https://preview.example.test/api/incidents"));
    const after = Date.now();
    hooks.onMailQueued();
    expect(seen[0].startedAt).toBeGreaterThanOrEqual(before);
    expect(seen[0].startedAt).toBeLessThanOrEqual(after);
  });
});

describe("runDrain – deadline", () => {
  it("counts the budget from `startedAt` (start of the invocation), not from the start of the drain", async () => {
    const j = job();
    const { store, get } = memoryOutbox([j]);
    const transport = fakeTransport();
    // 60 s budget, but the request already used 35 s: 25 s left < the 30 s claim reserve of a TEST job.
    expect(await runDrain(opts({ deadlineMs: 60_000, startedAt: T0 - 35_000 }), deps(store, transport, { t: T0 }))).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(get(j.id)).toMatchObject({ status: "PENDING", attempts: 0 });
    expect((await runDrain(opts({ deadlineMs: 60_000, startedAt: T0 - 25_000 }), deps(store, transport, { t: T0 }))).sent).toBe(1);
  });

  it("claim reserve per kind: a REPORT needs more time than a NOTICE", async () => {
    const report = job({ kind: "REPORT" });
    const notice = job({ kind: "NOTICE" });
    const { store, get } = memoryOutbox([report, notice]);
    const builders = { REPORT: testBuilder, NOTICE: testBuilder };
    const result = await runDrain(opts({ kinds: ["REPORT", "NOTICE"], builders, deadlineMs: DRAIN_CLAIM_RESERVE_MS.REPORT - 1 }), deps(store, fakeTransport(), { t: T0 }));
    expect(result.sent).toBe(1);
    expect(get(notice.id).status).toBe("SENT");
    expect(get(report.id)).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("passes the drain deadline to the transport", async () => {
    const { store } = memoryOutbox([job()]);
    const transport = fakeTransport();
    await runDrain(opts({ deadlineMs: 60_000 }), deps(store, transport, { t: T0 }));
    expect(transport.options).toEqual([{ deadline: T0 + 60_000 }]);
  });

  it("no send with less than SEND_MIN_BUDGET_MS left: the job goes back to PENDING (attempt not counted) and the drain stops", async () => {
    const slow = job({ attempts: 1, lastError: "Lần trước lỗi" });
    const next = job();
    const { store, get } = memoryOutbox([slow, next]);
    const clock = { t: T0 };
    const transport = fakeTransport();
    const builder: JobBuilder = async (j) => {
      clock.t += DRAIN_CLAIM_RESERVE_MS.TEST - SEND_MIN_BUDGET_MS + 1; // building ate the time of the send
      return { mail: { to: j.to, cc: [], subject: "x", html: "<p>x</p>" } };
    };
    const result = await runDrain(opts({ builders: { TEST: builder }, deadlineMs: DRAIN_CLAIM_RESERVE_MS.TEST }), deps(store, transport, clock));
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(transport.sent).toEqual([]);
    const back = get(slow.id);
    expect(back).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Lần trước lỗi", nextAttemptAt: iso(clock.t) });
    expect("leaseUntil" in back).toBe(false);
    expect(get(next.id)).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("a step that throws OutOfTimeError (PDF render) releases the job the same way", async () => {
    const j = job({ kind: "REPORT" });
    const { store, get } = memoryOutbox([j]);
    const builder: JobBuilder = async () => {
      throw new OutOfTimeError();
    };
    const result = await runDrain(opts({ kinds: ["REPORT"], builders: { REPORT: builder }, deadlineMs: 120_000 }), deps(store, fakeTransport(), { t: T0 }));
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 0 });
    expect(get(j.id)).toMatchObject({ status: "PENDING", attempts: 0, nextAttemptAt: iso(T0) });
  });

  it("assertTimeToSend: enough time before the deadline and on the lease", () => {
    const lease = (ms: number) => ({ leaseUntil: iso(T0 + ms) });
    expect(() => assertTimeToSend(lease(MAIL_LEASE_MS), T0 + SEND_MIN_BUDGET_MS, T0)).not.toThrow();
    expect(() => assertTimeToSend(lease(MAIL_LEASE_MS), T0 + SEND_MIN_BUDGET_MS - 1, T0)).toThrow(OutOfTimeError);
    expect(() => assertTimeToSend(lease(LEASE_SEND_MARGIN_MS - 1), T0 + 60_000, T0)).toThrow(OutOfTimeError);
    expect(() => assertTimeToSend({}, T0 + 60_000, T0)).toThrow(OutOfTimeError);
  });
});

describe("notice catch-up drain (incident / reward routes)", () => {
  const BASE = "https://nennep.example.edu.vn";
  let seen: DrainOptions[];

  beforeEach(() => {
    seen = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    resetNoticeDrainThrottleForTests();
    setDrainSchedulerForTests((o) => seen.push(o));
    setMailTransportForTests(fakeTransport());
  });

  afterEach(() => {
    vi.useRealTimers();
    resetNoticeDrainThrottleForTests();
    setDrainSchedulerForTests(null);
    setMailTransportForTests(null);
  });

  it("drains the due NOTICE jobs at most once per OVERDUE_NOTICE_CHECK_MS per instance", async () => {
    await overdueNoticeTask(BASE, T0 - 1_000)();
    expect(seen).toEqual([{ kinds: ["NOTICE"], builders: { NOTICE: buildNoticeJob }, deadlineMs: NOTICE_DRAIN_MS, startedAt: T0 - 1_000, baseUrl: BASE }]);
    vi.setSystemTime(T0 + OVERDUE_NOTICE_CHECK_MS - 1);
    await overdueNoticeTask(BASE, Date.now())();
    expect(seen).toHaveLength(1);
    vi.setSystemTime(T0 + OVERDUE_NOTICE_CHECK_MS);
    await overdueNoticeTask(BASE, Date.now())();
    expect(seen).toHaveLength(2);
  });

  it("skipped when the request queued notices (their own drain runs) or a notice drain just started", async () => {
    await overdueNoticeTask(BASE, T0, () => true)();
    expect(seen).toEqual([]);
    scheduleNoticeDrain(BASE, T0);
    expect(seen).toHaveLength(1);
    await overdueNoticeTask(BASE, T0)();
    expect(seen).toHaveLength(1);
  });

  it("a drain that can no longer claim (slow request) neither counts for the throttle nor replaces the catch-up", async () => {
    const started = T0;
    expect(noticeDrainCanClaim(started, T0 + NOTICE_DRAIN_MS - DRAIN_CLAIM_RESERVE_MS.NOTICE)).toBe(true);
    // The scoring transaction took 31 s: the drain of this request cannot claim anymore.
    vi.setSystemTime(T0 + 31_000);
    expect(scheduleNoticeDrain(BASE, started)).toBe(false);
    expect(seen).toHaveLength(1);
    // This request's own catch-up is pointless (same deadline): nothing drained, the throttle untouched …
    await overdueNoticeTask(BASE, started)();
    expect(seen).toHaveLength(1);
    // … so the next request of the instance drains right away.
    vi.setSystemTime(T0 + 32_000);
    await overdueNoticeTask(BASE, Date.now())();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ kinds: ["NOTICE"], startedAt: T0 + 32_000 });
  });

  it("noticeHooks: notices queued late in a slow request leave the catch-up of the request on", () => {
    const hooks = noticeHooks(new NextRequest("https://preview.example.test/api/incidents"));
    vi.setSystemTime(T0 + 31_000);
    hooks.onMailQueued();
    expect(seen).toHaveLength(1); // scheduled anyway (it ends at once)
    // A later request is not throttled by that drain.
    vi.setSystemTime(T0 + 32_000);
    return overdueNoticeTask(BASE, Date.now())().then(() => expect(seen).toHaveLength(2));
  });

  it("nothing while mail is not configured; never throws", async () => {
    setMailTransportForTests(fakeTransport({ configured: false }));
    await overdueNoticeTask(BASE, T0)();
    expect(seen).toEqual([]);
    setDrainSchedulerForTests(() => {
      throw new Error("scheduler down");
    });
    setMailTransportForTests(fakeTransport());
    await expect(overdueNoticeTask(BASE, T0)()).resolves.toBeUndefined();
  });

  it("outside a request scope (scripts, tests calling handlers) the routes schedule no catch-up", () => {
    const req = new NextRequest("https://preview.example.test/api/incidents/x/feedback");
    expect(() => scheduleNoticeCatchUp(req)).not.toThrow();
    expect(() => noticeHooks(req)).not.toThrow();
    expect(seen).toEqual([]);
  });
});
