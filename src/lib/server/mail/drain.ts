/**
 * Outbox drain (mailOutbox): claims due jobs, builds them with the registered builders and sends them.
 *
 * - Candidates: every PENDING + SENDING job of each drained kind (read in pages of 100) – or every job of one batch –
 *   filtered to the due ones (job-state isJobDue), oldest first. Queries use equality filters only (no composite index).
 * - Each job: claim in a transaction (PENDING → SENDING, attempts + 1, 6-min lease; skipped when another drain got it),
 *   build (`builders[kind]`), keep only recipients inside the allowed domains, send, then SENT / SKIPPED / PENDING with
 *   backoff / FAILED – written only while the lease is still ours. The lease outlives every function (maxDuration
 *   ≤ 300 s) and no send starts close to its end, so concurrent drains never send a job twice.
 * - Deadline: `startedAt + deadlineMs`, anchored at the start of the invocation (after() work shares the route's
 *   maxDuration). No claim of a kind with less than DRAIN_CLAIM_RESERVE_MS[kind] left; no send with less than
 *   SEND_MIN_BUDGET_MS left (Graph requests are shortened to end before the deadline); a job whose step could not start
 *   in time (OutOfTimeError, e.g. a PDF render) goes back to PENDING without counting the attempt and the drain stops.
 * - Retries inside the drain: with nothing due, the drain sleeps until the next PENDING job it waits for ends its
 *   backoff (e.g. 1 min after a failed render or a Graph 429 / 5xx) when that still leaves the claim reserve of its kind
 *   before the deadline, and claims it again – instead of leaving it to a later drain (the daily cron when nobody
 *   watches). A batch drain waits for any job of its batch (one drain per batch); a school-wide drain (no batchId: the
 *   notice drains of the routes, "Gửi lại" of a notice, the cron) only for the jobs it claimed itself. Every such drain
 *   that waited for the same job put back by another drain would wake at the same millisecond and start its sendMail
 *   together with the others on the one mailbox (Graph: 4 concurrent requests → 429 MailboxConcurrency); those jobs go
 *   with the next catch-up drain or the cron. A job is handled again only once its stored state changed (every claim
 *   counts an attempt and the backoff grows), so the drain never loops on one job.
 * - ≥ 2.2 s between sends (Exchange Online: 30 messages / minute); DrainContext.onFinish callbacks run at the end.
 *   Never throws (errors are logged).
 */
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { after } from "next/server";
import { effectiveAllowedDomains, partitionByDomain } from "../../mail/address";
import { COL } from "../../firestore-paths";
import type { LevelId, MailJob, MailJobKind } from "../../types";
import { db } from "../firebase-admin";
import { runTx } from "../write";
import { appBaseUrl } from "./base-url";
import {
  JOB_STATE_MSG,
  claimJob,
  compareOldestFirst,
  failedJob,
  failureOf,
  isJobDue,
  outcomeOf,
  releasedJob,
  sentJob,
  skippedJob,
  type ClaimResult,
} from "./job-state";
import { loadMailSettings } from "./settings";
import { mailTransport } from "./transport";
import { OutOfTimeError, type DrainContext, type JobBuilder, type MailTransport, type OutgoingMail } from "./types";

/** The TEST builder (test-job.ts), re-exported for the modules that register every builder (REPORT_BUILDERS). */
export { buildTestJob } from "./test-job";

export interface DrainOptions {
  /** Kinds this drain may claim (jobs of other kinds stay PENDING). */
  kinds: MailJobKind[];
  /** Only jobs of this batch (REPORT: one batch per "Gửi" click). */
  batchId?: string;
  /** Message builder of each kind in `kinds` (NOTICE: buildNoticeJob; REPORT_BUILDERS covers every kind). */
  builders: Partial<Record<MailJobKind, JobBuilder>>;
  /** Time budget in ms from `startedAt`: DrainContext.deadline = startedAt + deadlineMs. */
  deadlineMs: number;
  /**
   * Epoch ms when the invocation running the drain started (captured at the top of the route handler): work scheduled
   * with after() shares the route's maxDuration, counted from there. Default: the start of the drain.
   */
  startedAt?: number;
  /** Base URL of links; default appBaseUrl(). */
  baseUrl?: string;
}

export interface DrainResult {
  sent: number;
  failed: number;
  skipped: number;
  /** Back to PENDING with a backoff after a retryable error. */
  retried: number;
}

export const ALL_MAIL_KINDS: readonly MailJobKind[] = ["NOTICE", "REPORT", "TEST"];
/** Minimum gap between two sends of one drain (Exchange Online allows 30 messages per minute). */
export const MAIL_SEND_INTERVAL_MS = 2_200;
/**
 * No new claim of a job of this kind when less than this remains before the deadline: time to build, send and record
 * one job (REPORT: load the data, start Chromium, print the page, send a few MB).
 * NOTICE: 20 s – building takes 1-2 s (settings, the record, the class GVCN query) and the pacing ≤ 2.2 s, so ≥ 15.8 s
 * are left at the pre-send check (≥ SEND_MIN_BUDGET_MS; the Graph requests are shortened to fit); a slower build only
 * releases the job (attempt not counted), it never loses one. The 50 s notice drains of the routes can thus claim
 * during the first 30 s of the request.
 */
export const DRAIN_CLAIM_RESERVE_MS: Readonly<Record<MailJobKind, number>> = { NOTICE: 20_000, TEST: 30_000, REPORT: 90_000 };
/**
 * No send is started with less than this left before the deadline (the job goes back to PENDING, attempt not counted).
 * It covers the Graph margin (2 s) plus the minimum of the largest sendMail request (graph.ts graphMinSendMs, 13 s), so
 * a job that passes this check always starts its send when the token is cached; waiting for a new token may still
 * release it (OutOfTimeError of the transport), never cut off a send.
 */
export const SEND_MIN_BUDGET_MS = 15_000;
/** … nor with less than this left on its lease (Graph worst case: token 30 s + send 30 s, plus recording the result). */
export const LEASE_SEND_MARGIN_MS = 70_000;
/** Page size of the candidate queries. */
export const DRAIN_QUERY_LIMIT = 100;
/** At most this many candidates are read per (kind, status) query and drain pass. */
export const DRAIN_CANDIDATES_MAX = 2_000;
/**
 * Time budget of a drain run by a route with `maxDuration = 300` (report send, batch, retry, cron), from the start of
 * the invocation: 20 s are left for what came before `startedAt`, recording the last result and closing Chromium.
 */
export const LONG_DRAIN_MS = 280_000;
/** Budget of sendClaimedJob (test message, route maxDuration = 60 s whose own work came first). */
export const SYNC_SEND_BUDGET_MS = 45_000;

export const DRAIN_MSG = {
  noAllowedRecipient: (domains: readonly string[], blocked: readonly string[]) =>
    `Không có người nhận thuộc tên miền được phép (${domains.length > 0 ? domains.join(", ") : "chưa xác định"})` +
    (blocked.length > 0 ? `: đã bỏ ${blocked.join(", ")}.` : "."),
} as const;

/** Storage of the outbox: Firestore in production; `runDrain` also accepts an in-memory one (unit tests). */
export interface OutboxStore {
  /**
   * Jobs that may be due – every PENDING and SENDING job of `kinds` (read in pages of `limit`, at most
   * DRAIN_CANDIDATES_MAX per kind and status), or every job of `batchId` – in any order.
   */
  candidates(q: { kinds: readonly MailJobKind[]; batchId?: string; limit: number }): Promise<MailJob[]>;
  /** Atomically applies `claimJob` to the stored job; null when it is missing or not due. */
  claim(id: string, nowMs: number): Promise<ClaimResult | null>;
  /** Atomically replaces the job with `next` if it is still SENDING under `claimed`'s lease; false otherwise. */
  finish(claimed: MailJob, next: MailJob): Promise<boolean>;
}

export interface DrainDeps {
  store: OutboxStore;
  transport: MailTransport;
  /** Effective allowed recipient domains of a level. */
  allowedDomains: (levelId: LevelId) => Promise<string[]>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Minimum gap between two sends. */
  minIntervalMs: number;
}

/** Recipients outside `domains` removed (pure); cc never repeats a `to` address. */
export function restrictToDomains(mail: OutgoingMail, domains: readonly string[]): { mail: OutgoingMail; blocked: string[] } {
  const to = partitionByDomain(mail.to, domains);
  const cc = partitionByDomain(mail.cc, domains);
  return {
    mail: { ...mail, to: to.allowed, cc: cc.allowed.filter((e) => !to.allowed.includes(e)) },
    blocked: [...new Set([...to.blocked, ...cc.blocked])],
  };
}

/** Time check before a send (pure): OutOfTimeError when it could outlast the drain deadline or the job's lease. */
export function assertTimeToSend(job: Pick<MailJob, "leaseUntil">, deadline: number, nowMs: number): void {
  const leaseLeft = Date.parse(job.leaseUntil ?? "") - nowMs;
  if (deadline - nowMs < SEND_MIN_BUDGET_MS || !(leaseLeft >= LEASE_SEND_MARGIN_MS)) throw new OutOfTimeError();
}

/* --------------------------------- Firestore -------------------------------- */

/**
 * Every result of `q` (ascending document id, i.e. newest job first), read in pages of `pageSize` – a plain `limit`
 * would only ever see the newest jobs and starve older due ones. Stops after `cap` documents.
 */
async function allMatching(q: Query, pageSize: number, cap: number = DRAIN_CANDIDATES_MAX): Promise<MailJob[]> {
  const out: MailJob[] = [];
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    const snap = await (last ? q.startAfter(last) : q).limit(pageSize).get();
    for (const d of snap.docs) out.push(d.data() as MailJob);
    if (snap.size < pageSize || out.length >= cap) return out;
    last = snap.docs[snap.docs.length - 1];
  }
}

function firestoreOutbox(): OutboxStore {
  const col = () => db().collection(COL.mailOutbox);
  return {
    async candidates({ kinds, batchId, limit }) {
      if (batchId) {
        const snap = await col().where("batchId", "==", batchId).get();
        return snap.docs.map((d) => d.data() as MailJob);
      }
      // One query per (status, kind): equality filters only, served by the automatic single-field indexes.
      const lists = await Promise.all(
        kinds.flatMap((kind) => (["PENDING", "SENDING"] as const).map((status) => allMatching(col().where("status", "==", status).where("kind", "==", kind), limit))),
      );
      return lists.flat();
    },
    claim: (id, nowMs) =>
      runTx(async (tx) => {
        const ref = col().doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const result = claimJob(snap.data() as MailJob, nowMs);
        if (result) tx.set(ref, result.job);
        return result;
      }),
    finish: (claimed, next) =>
      runTx(async (tx) => {
        const ref = col().doc(claimed.id);
        const snap = await tx.get(ref);
        const current = snap.data() as MailJob | undefined;
        if (!current || current.status !== "SENDING" || current.leaseUntil !== claimed.leaseUntil) return false;
        tx.set(ref, next);
        return true;
      }),
  };
}

/* ------------------------------- test hooks ------------------------------- */

let intervalForTests: number | null = null;
let schedulerForTests: ((opts: DrainOptions) => void) | null = null;

/** TESTS ONLY: gap between sends (null restores MAIL_SEND_INTERVAL_MS). */
export function setDrainIntervalForTests(ms: number | null): void {
  intervalForTests = ms;
}

/** TESTS ONLY: receives the options of every scheduleDrain call instead of `after()` (null restores it). */
export function setDrainSchedulerForTests(fn: ((opts: DrainOptions) => void) | null): void {
  schedulerForTests = fn;
}

function defaultDeps(): DrainDeps {
  const transport = mailTransport();
  return {
    store: firestoreOutbox(),
    transport,
    allowedDomains: async (levelId) => effectiveAllowedDomains((await loadMailSettings(levelId)).allowedDomains, transport.sender),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    minIntervalMs: intervalForTests ?? MAIL_SEND_INTERVAL_MS,
  };
}

/* ---------------------------------- drain ---------------------------------- */

interface Pacer {
  /** Epoch ms of the last send attempt. */
  last: number;
}

async function finishWithRetry(deps: DrainDeps, claimed: MailJob, next: MailJob): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      if (!(await deps.store.finish(claimed, next))) console.warn(`[mail] job ${claimed.id}: lease lost, result ${next.status} not recorded`);
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await deps.sleep(500 * attempt);
    }
  }
}

interface Delivery {
  /** State written. */
  job: MailJob;
  /** Out of time before the send: back to PENDING, attempt not counted (the drain stops). */
  released: boolean;
}

/**
 * Build + send one claimed job and record the outcome. Out of time before the send (OutOfTimeError of a step or of
 * the pre-send check): released back to PENDING – FAILED for a `final` (synchronous) send, whose failure is final.
 */
async function deliver(
  claimed: MailJob,
  builders: DrainOptions["builders"],
  ctx: DrainContext,
  deps: DrainDeps,
  pacer: Pacer,
  opts: { final?: boolean } = {},
): Promise<Delivery> {
  let next: MailJob;
  let released = false;
  try {
    const builder = builders[claimed.kind];
    if (!builder) {
      next = failedJob(claimed, { message: JOB_STATE_MSG.noBuilder(claimed.kind), retryable: false }, deps.now());
    } else {
      const built = await builder(claimed, ctx);
      if ("skip" in built) {
        next = skippedJob(claimed, built.skip);
      } else {
        const domains = await deps.allowedDomains(claimed.levelId);
        const { mail, blocked } = restrictToDomains(built.mail, domains);
        if (mail.to.length === 0) {
          next = skippedJob(claimed, DRAIN_MSG.noAllowedRecipient(domains, blocked));
        } else {
          const wait = pacer.last + deps.minIntervalMs - deps.now();
          if (wait > 0) await deps.sleep(wait);
          assertTimeToSend(claimed, ctx.deadline, deps.now());
          pacer.last = deps.now();
          await deps.transport.send(mail, { deadline: ctx.deadline });
          next = sentJob(claimed, mail, deps.now());
        }
      }
    }
  } catch (e) {
    if (e instanceof OutOfTimeError && !opts.final) {
      next = releasedJob(claimed, deps.now());
      released = true;
    } else {
      const failure = e instanceof OutOfTimeError ? { message: JOB_STATE_MSG.outOfTime, retryable: false } : failureOf(e);
      next = failedJob(claimed, failure, deps.now(), opts);
    }
  }
  await finishWithRetry(deps, claimed, next);
  return { job: next, released };
}

function drainContext(opts: Pick<DrainOptions, "baseUrl">, deps: DrainDeps, deadline: number, finishers: Array<() => Promise<void>>): DrainContext {
  return { baseUrl: opts.baseUrl ?? appBaseUrl(), transport: deps.transport, deadline, cache: new Map(), onFinish: (fn) => finishers.push(fn) };
}

async function runFinishers(finishers: ReadonlyArray<() => Promise<void>>): Promise<void> {
  for (const fn of finishers) {
    try {
      await fn();
    } catch (e) {
      console.error("[mail] drain cleanup failed:", e);
    }
  }
}

/** What a drain compares to know whether a job changed since it last handled it (claims and results all change it). */
function jobVersion(job: Pick<MailJob, "status" | "attempts" | "nextAttemptAt" | "leaseUntil">): string {
  return `${job.status}|${job.attempts}|${job.nextAttemptAt}|${job.leaseUntil ?? ""}`;
}

/**
 * When the drain should look again (pure): the earliest nextAttemptAt in the future of a PENDING job of `jobs` that
 * still leaves the claim reserve of its kind before `deadline`; undefined = none (the drain ends). Only PENDING jobs:
 * a SENDING job's lease (6 min) outlives any drain.
 */
export function nextRetryAt(jobs: readonly MailJob[], deadline: number, nowMs: number): number | undefined {
  let wake: number | undefined;
  for (const j of jobs) {
    if (j.status !== "PENDING") continue;
    const at = Date.parse(j.nextAttemptAt);
    if (!(at > nowMs) || at > deadline - DRAIN_CLAIM_RESERVE_MS[j.kind]) continue;
    if (wake === undefined || at < wake) wake = at;
  }
  return wake;
}

/** `drainMail` with explicit dependencies (unit tests pass an in-memory store, a fake clock and transport). */
export async function runDrain(opts: DrainOptions, deps: DrainDeps): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, failed: 0, skipped: 0, retried: 0 };
  const kinds = opts.kinds.filter((k) => opts.builders[k] !== undefined);
  if (!deps.transport.configured || kinds.length === 0) return result;
  const deadline = (opts.startedAt ?? deps.now()) + opts.deadlineMs;
  const finishers: Array<() => Promise<void>> = [];
  const ctx = drainContext(opts, deps, deadline, finishers);
  const pacer: Pacer = { last: Number.NEGATIVE_INFINITY };
  /** Job id → version of the job when this drain last took it from the candidates. */
  const seen = new Map<string, string>();
  /**
   * Ids of the jobs this drain claimed itself – the only ones a school-wide drain waits for. Not every job it saw: a job
   * that two drains both saw due belongs to the one whose claim won, and only that one wakes for its backoff.
   */
  const claimed = new Set<string>();
  const left = () => deadline - deps.now();
  const minReserve = Math.min(...kinds.map((k) => DRAIN_CLAIM_RESERVE_MS[k]));
  const inScope = (j: MailJob) => kinds.includes(j.kind) && (!opts.batchId || j.batchId === opts.batchId);
  let outOfTime = false;
  try {
    while (!outOfTime && left() >= minReserve) {
      const jobs = (await deps.store.candidates({ kinds, batchId: opts.batchId, limit: DRAIN_QUERY_LIMIT })).filter(inScope);
      // Read after the query (it takes a while on Firestore): the wait below then ends exactly at the backoff end.
      const now = deps.now();
      const due = jobs.filter((j) => seen.get(j.id) !== jobVersion(j) && isJobDue(j, now)).sort(compareOldestFirst);
      if (due.length === 0) {
        // Nothing due: wait for the next backoff that ends in time (a retry of this drain), else stop. A school-wide
        // drain never waits for a job another drain put back (see the header: they would all wake together).
        const wake = nextRetryAt(opts.batchId ? jobs : jobs.filter((j) => claimed.has(j.id)), deadline, now);
        if (wake === undefined) break;
        await deps.sleep(wake - now);
        continue;
      }
      for (const job of due) {
        if (left() < minReserve) break;
        seen.set(job.id, jobVersion(job));
        if (left() < DRAIN_CLAIM_RESERVE_MS[job.kind]) continue; // too late for this kind in this drain (time only shrinks)
        const claim = await deps.store.claim(job.id, deps.now());
        if (!claim) continue;
        claimed.add(job.id);
        let final = claim.job;
        if (claim.kind === "claimed") {
          const delivery = await deliver(claim.job, opts.builders, ctx, deps, pacer);
          if (delivery.released) {
            outOfTime = true;
            break;
          }
          final = delivery.job;
        }
        const outcome = outcomeOf(final.status);
        if (outcome) result[outcome] += 1;
      }
    }
  } catch (e) {
    console.error("[mail] drain stopped:", e);
  } finally {
    await runFinishers(finishers);
  }
  return result;
}

/**
 * Sends due jobs (PENDING with nextAttemptAt ≤ now, and SENDING with an expired lease), oldest first: claim in a
 * transaction (PENDING → SENDING, attempts + 1, 6-min lease), build, send, then SENT / SKIPPED / PENDING with backoff /
 * FAILED. ≥ 2.2 s between sends; runs the DrainContext.onFinish callbacks at the end. Never throws (errors are logged).
 */
export async function drainMail(opts: DrainOptions): Promise<DrainResult> {
  try {
    const result = await runDrain(opts, defaultDeps());
    if (result.sent + result.failed + result.skipped + result.retried > 0) console.info("[mail] drain:", JSON.stringify(result));
    return result;
  } catch (e) {
    console.error("[mail] drain failed:", e);
    return { sent: 0, failed: 0, skipped: 0, retried: 0 };
  }
}

/**
 * Sends one job that was created already claimed (SENDING, e.g. the test message) right now and returns its final
 * state: SENT, SKIPPED, or FAILED on any error (no backoff – the caller is waiting). Errors writing the result throw.
 * The send is over within `deadlineMs` (default SYNC_SEND_BUDGET_MS), so the outcome is recorded before the route's
 * maxDuration even when Microsoft 365 is slow.
 */
export async function sendClaimedJob(job: MailJob, opts: { builders: DrainOptions["builders"]; baseUrl?: string; deadlineMs?: number }): Promise<MailJob> {
  const deps = defaultDeps();
  const finishers: Array<() => Promise<void>> = [];
  const ctx = drainContext(opts, deps, deps.now() + (opts.deadlineMs ?? SYNC_SEND_BUDGET_MS), finishers);
  try {
    return (await deliver(job, opts.builders, ctx, deps, { last: Number.NEGATIVE_INFINITY }, { final: true })).job;
  } finally {
    await runFinishers(finishers);
  }
}

/**
 * `drainMail(opts)` awaited in the current task, for work that already runs after the response (inside after()); the
 * TESTS ONLY scheduler receives `opts` instead. No-op when mail is not configured.
 */
export async function drainNow(opts: DrainOptions): Promise<void> {
  if (!mailTransport().configured) return;
  if (schedulerForTests) {
    schedulerForTests(opts);
    return;
  }
  await drainMail(opts);
}

/** `after(() => drainMail(opts))` from next/server: drains once the response is sent; no-op when mail is not configured. */
export function scheduleDrain(opts: DrainOptions): void {
  if (!mailTransport().configured) return;
  if (schedulerForTests) {
    schedulerForTests(opts);
    return;
  }
  const task = async (): Promise<void> => {
    await drainMail(opts);
  };
  try {
    after(task);
  } catch {
    // Outside a request scope (scripts): run detached; drainMail never rejects.
    void task();
  }
}
