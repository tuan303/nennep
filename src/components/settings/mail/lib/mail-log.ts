/**
 * "Nhật ký gửi thư" of Cài đặt → Email (GET /api/mail/log, newest first): status tones, filters, counts, the
 * recipient / problem lines of a job and the optimistic state after "Gửi lại". Pure – unit-tested.
 */
import type { Tone } from "@/components/ui/tones";
import type { MailJobView } from "@/lib/contract";
import { MAIL_JOB_STATUS_LABELS } from "@/lib/constants";
import type { MailJobStatus } from "@/lib/types";

export const MAIL_LOG_LIMIT = 100;

export const MAIL_STATUS_ORDER: readonly MailJobStatus[] = ["FAILED", "SKIPPED", "PENDING", "SENDING", "SENT"];

export const MAIL_STATUS_TONES: Record<MailJobStatus, Tone> = {
  PENDING: "muted",
  SENDING: "brand",
  SENT: "ok",
  FAILED: "bad",
  SKIPPED: "warn",
};

/** "Gửi lại" is offered for jobs that will not be sent any more. */
export function canRetryMailJob(job: Pick<MailJobView, "status">): boolean {
  return job.status === "FAILED" || job.status === "SKIPPED";
}

export function mailLogCounts(items: readonly Pick<MailJobView, "status">[]): Record<MailJobStatus, number> {
  const counts: Record<MailJobStatus, number> = { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
  for (const j of items) counts[j.status] += 1;
  return counts;
}

export function filterMailLog<T extends Pick<MailJobView, "status">>(items: readonly T[], status?: MailJobStatus): T[] {
  return status ? items.filter((j) => j.status === status) : [...items];
}

/** "100 thư gần nhất · 2 lỗi · 1 bỏ qua · 3 đang chờ" (only the non-zero problem / waiting counts). */
export function mailLogSummary(items: readonly Pick<MailJobView, "status">[]): string {
  if (items.length === 0) return "Chưa có thư nào";
  const c = mailLogCounts(items);
  const parts = [`${items.length} thư gần nhất`];
  if (c.FAILED > 0) parts.push(`${c.FAILED} lỗi`);
  if (c.SKIPPED > 0) parts.push(`${c.SKIPPED} bỏ qua`);
  const waiting = c.PENDING + c.SENDING;
  if (waiting > 0) parts.push(`${waiting} đang chờ gửi`);
  return parts.join(" · ");
}

/** Status filter options with their counts ("Lỗi (2)"); statuses absent from the log are left out. */
export function mailStatusOptions(items: readonly Pick<MailJobView, "status">[]): Array<{ value: MailJobStatus; label: string }> {
  const c = mailLogCounts(items);
  return MAIL_STATUS_ORDER.filter((s) => c[s] > 0).map((s) => ({ value: s, label: `${MAIL_JOB_STATUS_LABELS[s]} (${c[s]})` }));
}

/** "a@x.vn, b@x.vn · CC 2"; a notice not sent yet has no recipients (they are resolved at send time). */
export function mailRecipientsText(job: Pick<MailJobView, "to" | "cc" | "kind" | "status">): string {
  if (job.to.length === 0) return job.kind === "NOTICE" && (job.status === "PENDING" || job.status === "SENDING") ? "Xác định khi gửi" : "–";
  const shown = job.to.slice(0, 2).join(", ");
  const more = job.to.length > 2 ? ` +${job.to.length - 2}` : "";
  const cc = job.cc.length > 0 ? ` · CC ${job.cc.length}` : "";
  return `${shown}${more}${cc}`;
}

/** Why a job failed / was skipped / is waiting again (Vietnamese, from the server), or undefined. */
export function mailProblemText(job: Pick<MailJobView, "status" | "lastError" | "skipReason" | "attempts">): string | undefined {
  if (job.status === "SKIPPED") return job.skipReason ?? job.lastError;
  if (job.status === "FAILED") return job.lastError ?? "Không gửi được.";
  if (job.status === "PENDING" && job.lastError) return `Lần ${job.attempts} chưa gửi được (sẽ thử lại): ${job.lastError}`;
  return undefined;
}

/** When the line happened: sending time once sent, otherwise the creation time. */
export function mailJobTime(job: Pick<MailJobView, "sentAt" | "createdAt">): string {
  return job.sentAt ?? job.createdAt;
}

/** Optimistic row after POST /api/mail/jobs/:id/retry succeeded (the server put it back in the queue). */
export function markMailJobRetried(items: readonly MailJobView[], id: string, nowIso: string): MailJobView[] {
  return items.map((j) => {
    if (j.id !== id) return j;
    const { lastError: _lastError, skipReason: _skipReason, ...rest } = j;
    return { ...rest, status: "PENDING", attempts: 0, nextAttemptAt: nowIso };
  });
}
