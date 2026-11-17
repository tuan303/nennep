/**
 * The drains the incident / reward routes schedule. They run after the response is sent, inside the route's
 * `maxDuration = 60`, with a deadline counted from the start of the request. Imported by routes only: the services stay
 * free of next/server.
 *
 * - After a mutation that queued GVCN notices: a NOTICE drain (noticeHooks → onMailQueued).
 * - Otherwise a catch-up NOTICE drain, at most once per OVERDUE_NOTICE_CHECK_MS per server instance: notices that went
 *   back to PENDING after a retryable error (1 min, 5 min, … backoff) go out with the next incident / reward request
 *   instead of waiting for the daily cron. With nothing due it costs the two candidate queries.
 * A drain only counts for that throttle – and only replaces the catch-up of its request – while it can still claim
 * (noticeDrainCanClaim): a slow request (e.g. a scoring transaction retried under contention) leaves the catch-up to
 * the next request of the instance instead of silencing it for a minute.
 */
import { after, type NextRequest } from "next/server";
import { appBaseUrl } from "./base-url";
import { DRAIN_CLAIM_RESERVE_MS, drainNow, scheduleDrain, type DrainOptions } from "./drain";
import { buildNoticeJob, type NoticeCtx } from "./outbox";
import { mailTransport } from "./transport";

/** Time budget of a notice drain, from the start of the request (route maxDuration = 60 s). */
export const NOTICE_DRAIN_MS = 50_000;
/** Minimum gap between two NOTICE drains started by the routes of one server instance (catch-up check). */
export const OVERDUE_NOTICE_CHECK_MS = 60_000;

/** Epoch ms of the last NOTICE drain started by a route of this server instance. */
let lastNoticeDrainAt = Number.NEGATIVE_INFINITY;

/** TESTS ONLY: forget the last NOTICE drain (the next catch-up check runs). */
export function resetNoticeDrainThrottleForTests(): void {
  lastNoticeDrainAt = Number.NEGATIVE_INFINITY;
}

function noticeDrainOptions(baseUrl: string | undefined, startedAt: number): DrainOptions {
  return { kinds: ["NOTICE"], builders: { NOTICE: buildNoticeJob }, deadlineMs: NOTICE_DRAIN_MS, startedAt, baseUrl };
}

/** Can a notice drain of a request started at `startedAt` still claim a job (pure)? */
export function noticeDrainCanClaim(startedAt: number, now: number = Date.now()): boolean {
  return now - startedAt <= NOTICE_DRAIN_MS - DRAIN_CLAIM_RESERVE_MS.NOTICE;
}

/**
 * Drain of the NOTICE jobs after the response (no-op when mail is not configured); `startedAt` = start of the request.
 * Returns whether that drain can still claim – only then does it count as this instance's last notice drain.
 */
export function scheduleNoticeDrain(baseUrl?: string, startedAt: number = Date.now()): boolean {
  const canClaim = noticeDrainCanClaim(startedAt);
  if (canClaim) lastNoticeDrainAt = Date.now();
  scheduleDrain(noticeDrainOptions(baseUrl, startedAt));
  return canClaim;
}

/**
 * The catch-up task (exported for tests): drains the due NOTICE jobs, unless `skip()` (the request queued notices,
 * whose own drain can still claim), the request is too old to claim anything, or a NOTICE drain started on this
 * instance less than OVERDUE_NOTICE_CHECK_MS ago. Never throws.
 */
export function overdueNoticeTask(baseUrl: string | undefined, startedAt: number, skip: () => boolean = () => false): () => Promise<void> {
  return async () => {
    try {
      if (skip()) return;
      const now = Date.now();
      if (!noticeDrainCanClaim(startedAt, now)) return; // too late in this request: the next one checks
      if (now - lastNoticeDrainAt < OVERDUE_NOTICE_CHECK_MS) return;
      lastNoticeDrainAt = now;
      await drainNow(noticeDrainOptions(baseUrl, startedAt));
    } catch (e) {
      console.error("[mail] overdue notice check failed:", e);
    }
  };
}

/** Schedules the catch-up task after the response; nothing outside a request scope (scripts, tests). Never throws. */
function scheduleOverdueCheck(baseUrl: string, startedAt: number, skip: () => boolean): void {
  try {
    if (!mailTransport().configured) return;
    after(overdueNoticeTask(baseUrl, startedAt, skip));
  } catch {
    // Outside a request scope: no catch-up (the daily cron still sends what is due).
  }
}

/**
 * Catch-up NOTICE drain after the response of a route that never queues notices itself (e.g. GVCN feedback); call it at
 * the top of the handler.
 */
export function scheduleNoticeCatchUp(req: NextRequest): void {
  scheduleOverdueCheck(appBaseUrl(req.nextUrl.origin), Date.now(), () => false);
}

/**
 * NoticeCtx of an incident / reward route – call it at the top of the handler (the drain deadline counts from here):
 * notices queued by the mutation are drained right after the response; otherwise the throttled catch-up drain runs.
 */
export function noticeHooks(req: NextRequest): Required<NoticeCtx> {
  const startedAt = Date.now();
  const baseUrl = appBaseUrl(req.nextUrl.origin);
  /** A notice drain of this request that can still claim was scheduled (the catch-up is then redundant). */
  let draining = false;
  scheduleOverdueCheck(baseUrl, startedAt, () => draining);
  return {
    onMailQueued: () => {
      draining = scheduleNoticeDrain(baseUrl, startedAt) || draining;
    },
  };
}
