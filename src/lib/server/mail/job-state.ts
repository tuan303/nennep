/**
 * Life cycle of an outbox job (pure): which jobs are due, claiming (lease), and the state after a send / skip / error.
 *
 *   PENDING ──claim──▶ SENDING ──▶ SENT | SKIPPED | FAILED
 *      ▲                  │
 *      └── retryable error (attempts < MAIL_JOB_MAX_ATTEMPTS): back to PENDING, nextAttemptAt = now + backoff
 *
 * A SENDING job whose lease expired (the drain died mid-send) is due again; once it has used every attempt – or for a
 * TEST message, whose failure is final – it is FAILED instead. A job claimed by a drain that then ran out of time goes
 * back to PENDING without counting the attempt (releasedJob). FAILED / SKIPPED jobs go back to PENDING only through
 * "Gửi lại" (requeuedJob).
 */
import { MAIL_JOB_MAX_ATTEMPTS } from "../../constants";
import { nextAttemptDelayMs } from "../../mail/policy";
import type { MailJob, MailJobKind, MailJobStatus } from "../../types";
import { MailSendError, type OutgoingMail } from "./types";

/**
 * How long a claimed job stays reserved for its drain. Longer than the longest function life (maxDuration = 300 s)
 * plus a margin, so an expired lease always means its drain is dead and can never send the job a second time.
 */
export const MAIL_LEASE_MS = 6 * 60_000;

export const JOB_STATE_MSG = {
  interrupted: "Gửi thư bị gián đoạn nhiều lần (quá thời gian xử lý). Bấm “Gửi lại” để thử lại.",
  testInterrupted: "Gửi thư thử bị gián đoạn (quá thời gian xử lý) nên không được gửi lại tự động. Bấm “Gửi thư thử tới tôi” để thử lại.",
  outOfTime: "Không đủ thời gian xử lý để gửi thư.",
  noBuilder: (kind: MailJobKind) => `Không có trình tạo nội dung cho loại thư ${kind}.`,
  unexpected: (detail: string) => `Lỗi hệ thống khi chuẩn bị hoặc gửi thư${detail ? ` (${detail})` : ""}.`,
} as const;

const iso = (ms: number) => new Date(ms).toISOString();
const time = (s: string | undefined): number => (s ? Date.parse(s) : Number.NaN);

/** Optional fields a new state may drop. */
type OptionalJobKey = "leaseUntil" | "lastError" | "skipReason" | "sentAt";

/** Copy without the transient / outcome fields that a new state must not inherit. */
function withoutKeys(job: MailJob, keys: readonly OptionalJobKey[]): MailJob {
  const out: MailJob = { ...job };
  for (const k of keys) delete out[k];
  return out;
}

/** PENDING and its nextAttemptAt reached, or SENDING with an expired lease. */
export function isJobDue(job: Pick<MailJob, "status" | "nextAttemptAt" | "leaseUntil">, nowMs: number): boolean {
  if (job.status === "PENDING") {
    const at = time(job.nextAttemptAt);
    return !Number.isFinite(at) || at <= nowMs;
  }
  if (job.status === "SENDING") {
    const lease = time(job.leaseUntil);
    return !Number.isFinite(lease) || lease <= nowMs;
  }
  return false;
}

/** Oldest first: createdAt, then the id (ids are inverted timestamps, so a larger id is older). */
export function compareOldestFirst(a: Pick<MailJob, "createdAt" | "id">, b: Pick<MailJob, "createdAt" | "id">): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

export type ClaimResult = { kind: "claimed"; job: MailJob } | { kind: "failed"; job: MailJob };

/**
 * State written by a claim: SENDING with attempts + 1 and a lease (`claimed`), or FAILED when an interrupted job has
 * no attempt left or is a TEST message (`failed` – the admin was told the outcome long ago, a late copy would only
 * confuse); null when the job is not due (someone else holds it, already done, backing off).
 */
export function claimJob(job: MailJob, nowMs: number): ClaimResult | null {
  if (!isJobDue(job, nowMs)) return null;
  if (job.status === "SENDING" && (job.attempts >= MAIL_JOB_MAX_ATTEMPTS || job.kind === "TEST")) {
    const lastError = job.kind === "TEST" ? JOB_STATE_MSG.testInterrupted : JOB_STATE_MSG.interrupted;
    return { kind: "failed", job: { ...withoutKeys(job, ["leaseUntil"]), status: "FAILED", lastError } };
  }
  return { kind: "claimed", job: { ...job, status: "SENDING", attempts: job.attempts + 1, leaseUntil: iso(nowMs + MAIL_LEASE_MS) } };
}

/** SENT with the actual recipients and subject. */
export function sentJob(job: MailJob, mail: Pick<OutgoingMail, "to" | "cc" | "subject">, nowMs: number): MailJob {
  return {
    ...withoutKeys(job, ["leaseUntil", "lastError", "skipReason"]),
    status: "SENT",
    to: [...mail.to],
    cc: [...mail.cc],
    subject: mail.subject,
    sentAt: iso(nowMs),
  };
}

/** SKIPPED (nothing to send, e.g. the class has no GVCN email). */
export function skippedJob(job: MailJob, reason: string): MailJob {
  return { ...withoutKeys(job, ["leaseUntil", "lastError"]), status: "SKIPPED", skipReason: reason };
}

export interface SendFailure {
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/** Vietnamese failure of anything thrown while building or sending (unknown errors are treated as transient). */
export function failureOf(e: unknown): SendFailure {
  if (e instanceof MailSendError) return { message: e.message, retryable: e.retryable, ...(e.retryAfterMs !== undefined ? { retryAfterMs: e.retryAfterMs } : {}) };
  const detail = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return { message: JOB_STATE_MSG.unexpected(detail.slice(0, 200)), retryable: true };
}

/**
 * After a failed attempt: back to PENDING with the policy backoff (or the provider's Retry-After when longer) while
 * the error is retryable and attempts remain; FAILED otherwise. `final` (test message sent while the admin waits)
 * never backs off.
 */
export function failedJob(job: MailJob, failure: SendFailure, nowMs: number, opts: { final?: boolean } = {}): MailJob {
  const base = withoutKeys(job, ["leaseUntil", "skipReason"]);
  if (failure.retryable && !opts.final && job.attempts < MAIL_JOB_MAX_ATTEMPTS) {
    const delay = Math.max(nextAttemptDelayMs(job.attempts), failure.retryAfterMs ?? 0);
    return { ...base, status: "PENDING", nextAttemptAt: iso(nowMs + delay), lastError: failure.message };
  }
  return { ...base, status: "FAILED", lastError: failure.message };
}

/**
 * A claimed job whose drain ran out of time before sending it: PENDING now again, the attempt of the claim not counted
 * (nothing was sent), the error of the previous attempt kept.
 */
export function releasedJob(job: MailJob, nowMs: number): MailJob {
  return { ...withoutKeys(job, ["leaseUntil"]), status: "PENDING", attempts: Math.max(0, job.attempts - 1), nextAttemptAt: iso(nowMs) };
}

/** "Gửi lại": PENDING now, attempts reset, previous outcome cleared. */
export function requeuedJob(job: MailJob, nowMs: number): MailJob {
  return { ...withoutKeys(job, ["leaseUntil", "lastError", "skipReason", "sentAt"]), status: "PENDING", attempts: 0, nextAttemptAt: iso(nowMs) };
}

/** Statuses "Gửi lại" accepts. */
export const RETRYABLE_STATUSES: readonly MailJobStatus[] = ["FAILED", "SKIPPED"];

/** Drain counter a final state belongs to. */
export function outcomeOf(status: MailJobStatus): "sent" | "skipped" | "failed" | "retried" | undefined {
  switch (status) {
    case "SENT":
      return "sent";
    case "SKIPPED":
      return "skipped";
    case "FAILED":
      return "failed";
    case "PENDING":
      return "retried";
    case "SENDING":
      return undefined;
  }
}
