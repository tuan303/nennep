/**
 * Progress of one "Gửi" click of Báo cáo tuần/tháng (pure – unit-tested): the polling state of GET
 * /api/mail/batches/:id (every 3 s until `done`, backing off after failed polls, giving up after 10 minutes – the
 * server keeps sending), counts / progress line, status tones, "Gửi lại", the toast shown when the batch is done and
 * what reopening the dialog keeps (a batch with failed / skipped emails stays on screen until "Gửi thư khác").
 * The polls themselves are scheduled by the batch store (batch-store.ts).
 */
import type { Tone } from "@/components/ui/tones";
import { LEVELS } from "@/lib/constants";
import type { MailBatchItem, MailBatchResponse, ReportMailSendResponse } from "@/lib/contract";
import type { LevelId, MailJobStatus } from "@/lib/types";

export const BATCH_POLL_MS = 3_000;
/** Longest wait between two polls after repeated failures. */
export const BATCH_POLL_BACKOFF_MAX_MS = 30_000;
/** Polling stops after this long without the batch finishing (the drain / cron keep sending; "Cập nhật" resumes). */
export const BATCH_POLL_MAX_MS = 10 * 60_000;

export const MAIL_STATUS_TONE: Record<MailJobStatus, Tone> = {
  PENDING: "muted",
  SENDING: "brand",
  SENT: "ok",
  FAILED: "bad",
  SKIPPED: "warn",
};

/** Wait before the next poll: 3 s, then doubling per consecutive failure up to 30 s. */
export function nextPollDelayMs(failures: number): number {
  if (failures <= 0) return BATCH_POLL_MS;
  return Math.min(BATCH_POLL_BACKOFF_MAX_MS, BATCH_POLL_MS * 2 ** Math.min(failures, 10));
}

export interface BatchWatch {
  batchId: string;
  /** Level of the report: the dialog shows (and blocks composing with) only the batch of its own level. */
  levelId: LevelId;
  /** Jobs queued by the send (shown until the first poll answers). */
  jobs: number;
  /** Period of the report (toast text). */
  periodLabel: string;
  /** Last answer of GET /api/mail/batches/:id. */
  data?: MailBatchResponse;
  /** "polling": a poll is scheduled; "done": every job finished; "stopped": gave up (time limit / access lost). */
  status: "polling" | "done" | "stopped";
  /** Consecutive failed polls. */
  failures: number;
  /** Message of the last failed poll (cleared by a successful one). */
  error?: string;
  /** Epoch ms polling (re)started. */
  since: number;
  /** Changes whenever a new poll must be scheduled (effect dependency). */
  round: number;
  /** Wait before that poll. */
  delayMs: number;
  /**
   * Report PDFs were off on the server when the batch was queued (MailStatus.pdfWarning): its emails carry the link to
   * the report but no PDF attachment.
   */
  withoutPdf?: true;
}

export interface StartWatchOptions {
  /** MailStatus.pdfWarning was set (see BatchWatch.withoutPdf). */
  withoutPdf?: boolean;
}

/** Watch of a batch just queued: first poll at once. */
export function startWatch(res: ReportMailSendResponse, levelId: LevelId, periodLabel: string, now: number, opts: StartWatchOptions = {}): BatchWatch {
  const w: BatchWatch = { batchId: res.batchId, levelId, jobs: res.jobs, periodLabel, status: "polling", failures: 0, since: now, round: 1, delayMs: 0 };
  if (opts.withoutPdf) w.withoutPdf = true;
  return w;
}

/**
 * The last batch sent per level. Each one is polled (and toasted when done) on its own, also while the screen shows
 * another level; the dialog shows only the one of its level, so switching level neither shows nor blocks on another
 * level's batch.
 */
export type LevelWatches = Partial<Record<LevelId, BatchWatch>>;

/** `watches` with the watch of `levelId` replaced by `fn(it)` (removed when undefined); the same object when unchanged. */
export function updateLevelWatch(
  watches: LevelWatches,
  levelId: LevelId,
  fn: (w: BatchWatch | undefined) => BatchWatch | undefined,
): LevelWatches {
  const before = watches[levelId];
  const after = fn(before);
  if (after === before) return watches;
  const next = { ...watches };
  if (after) next[levelId] = after;
  else delete next[levelId];
  return next;
}

/** Polls to schedule now, by poll key (batch + round – a new key means a new poll; the others keep their timer). */
export function duePolls(watches: LevelWatches): Map<string, BatchWatch> {
  const due = new Map<string, BatchWatch>();
  for (const w of Object.values(watches)) if (w?.status === "polling") due.set(`${w.batchId}#${w.round}`, w);
  return due;
}

const timedOut = (w: BatchWatch, now: number) => now - w.since >= BATCH_POLL_MAX_MS;

/** A poll answered. */
export function applyPoll(w: BatchWatch, data: MailBatchResponse, now: number): BatchWatch {
  const status = data.done ? "done" : timedOut(w, now) ? "stopped" : "polling";
  const { error: _error, ...rest } = w;
  return { ...rest, data, status, failures: 0, round: w.round + 1, delayMs: BATCH_POLL_MS };
}

/** HTTP statuses after which polling cannot succeed (signed out, no access, unknown batch). */
const FATAL_POLL_STATUS = new Set([401, 403, 404]);

/** A poll failed (`status` of the ApiClientError; 0 = network). */
export function applyPollError(w: BatchWatch, err: { status: number; message: string }, now: number): BatchWatch {
  const failures = w.failures + 1;
  const stop = FATAL_POLL_STATUS.has(err.status) || timedOut(w, now);
  return { ...w, status: stop ? "stopped" : "polling", failures, error: err.message, round: w.round + 1, delayMs: nextPollDelayMs(failures) };
}

/** "Cập nhật": poll again now, with a fresh time limit. */
export function resumeWatch(w: BatchWatch, now: number): BatchWatch {
  return { ...w, status: "polling", failures: 0, since: now, round: w.round + 1, delayMs: 0 };
}

/** "Gửi lại" accepted (FAILED / SKIPPED → PENDING): show the job as waiting and follow the batch again. */
export function retryInWatch(w: BatchWatch, jobId: string, now: number): BatchWatch {
  const resumed = resumeWatch(w, now);
  return { ...resumed, delayMs: BATCH_POLL_MS, ...(w.data ? { data: markRetried(w.data, jobId) } : {}) };
}

/** The batch with job `jobId` back to PENDING (counts updated, not done). */
export function markRetried(res: MailBatchResponse, jobId: string): MailBatchResponse {
  const item = res.items.find((i) => i.id === jobId);
  if (!item || !canRetryItem(item)) return res;
  const counts = { ...res.counts, [item.status]: Math.max(0, res.counts[item.status] - 1), PENDING: res.counts.PENDING + 1 };
  const items = res.items.map((i): MailBatchItem => {
    if (i.id !== jobId) return i;
    const { lastError: _lastError, skipReason: _skipReason, sentAt: _sentAt, ...rest } = i;
    return { ...rest, status: "PENDING" };
  });
  return { ...res, items, counts, done: false };
}

/** "Gửi lại" is offered for failed and skipped jobs. */
export function canRetryItem(item: Pick<MailBatchItem, "status">): boolean {
  return item.status === "FAILED" || item.status === "SKIPPED";
}

export interface BatchProgress {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  /** PENDING + SENDING. */
  active: number;
  /** total − active. */
  finished: number;
  /** finished / total (0..1; 0 without jobs). */
  ratio: number;
}

export function batchProgress(res: Pick<MailBatchResponse, "counts">): BatchProgress {
  const c = res.counts;
  const total = c.PENDING + c.SENDING + c.SENT + c.FAILED + c.SKIPPED;
  const active = c.PENDING + c.SENDING;
  const finished = total - active;
  return { total, sent: c.SENT, failed: c.FAILED, skipped: c.SKIPPED, active, finished, ratio: total > 0 ? finished / total : 0 };
}

const n = (v: number) => v.toLocaleString("vi-VN");

/** "3 đã gửi · 1 lỗi · 1 bỏ qua · 2 đang chờ" (zero parts omitted; "Chưa có thư" without jobs). */
export function batchCountsLine(p: BatchProgress): string {
  const parts = [
    p.sent > 0 ? `${n(p.sent)} đã gửi` : "",
    p.failed > 0 ? `${n(p.failed)} lỗi` : "",
    p.skipped > 0 ? `${n(p.skipped)} bỏ qua` : "",
    p.active > 0 ? `${n(p.active)} đang chờ` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Chưa có thư";
}

/**
 * A finished batch that did not send every email (failed / skipped ones, or no job at all): its toast points to the
 * dialog, so reopening the dialog keeps showing it (with "Gửi lại") until the user starts a new message.
 */
export function batchNeedsAttention(res: Pick<MailBatchResponse, "counts">): boolean {
  const p = batchProgress(res);
  return !(p.total > 0 && p.sent === p.total);
}

/**
 * The watch of a level when its dialog is reopened: a batch that finished with every email sent is dropped (the
 * dialog composes a new message); a running / stopped batch, or a finished one that needs attention, is kept.
 */
export function watchOnReopen(w: BatchWatch | undefined): BatchWatch | undefined {
  if (w?.status !== "done" || !w.data) return w;
  return batchNeedsAttention(w.data) ? w : undefined;
}

/** Hint of the toast of a batch that needs attention (reopening the dialog shows that batch, see watchOnReopen). */
export const BATCH_RETRY_HINT = "Mở “Gửi email” để xem lỗi và gửi lại.";

/**
 * Hint of the toast of a batch of `levelId` that needs attention, given the level the report page shows (`shown`;
 * undefined: the user is on another page). The dialog only shows the batch of its own level, so on another level the
 * hint says to switch first, and away from Báo cáo it says where to go.
 */
export function batchRetryHint(levelId: LevelId, shown: LevelId | undefined): string {
  if (shown === levelId) return BATCH_RETRY_HINT;
  const level = LEVELS[levelId].short;
  return shown
    ? `Chuyển sang cấp ${level} rồi mở “Gửi email” để xem lỗi và gửi lại.`
    : `Mở Báo cáo tuần/tháng cấp ${level} rồi bấm “Gửi email” để xem lỗi và gửi lại.`;
}

export interface BatchFinishedNotice {
  title: string;
  text: string;
}

/** Notice above the rows of a finished batch that needs attention; undefined while running or when all were sent. */
export function batchFinishedNotice(res: MailBatchResponse): BatchFinishedNotice | undefined {
  if (!res.done || !batchNeedsAttention(res)) return undefined;
  const p = batchProgress(res);
  const notSent = p.failed + p.skipped;
  return {
    title: notSent > 0 ? `Còn ${n(notSent)} thư chưa gửi được` : "Lần gửi này không có thư nào",
    text:
      notSent > 0
        ? "Khắc phục lỗi rồi bấm “Gửi lại” ở từng thư. Kết quả lần gửi này được giữ lại khi bạn đóng và mở lại cửa sổ, cho đến khi bấm “Gửi thư khác”."
        : "Bấm “Gửi thư khác” để soạn thư mới.",
  };
}

export interface BatchToast {
  kind: "success" | "warning" | "error";
  title: string;
  description?: string;
}

/**
 * Toast of a finished batch: all sent / some not sent / none sent. Every kind names the batch (`periodLabel`, with the
 * level: the toast may come while the screen shows another level, whose dialog would not show this batch); `hint`
 * (batchRetryHint) says where to see and retry what was not sent.
 */
export function batchToast(res: MailBatchResponse, periodLabel: string, hint: string = BATCH_RETRY_HINT): BatchToast {
  const p = batchProgress(res);
  if (!batchNeedsAttention(res)) {
    return { kind: "success", title: `Đã gửi ${n(p.sent)} thư báo cáo`, description: periodLabel };
  }
  const notSent = [p.failed > 0 ? `${n(p.failed)} thư lỗi` : "", p.skipped > 0 ? `${n(p.skipped)} thư bỏ qua` : ""].filter(Boolean).join(", ");
  if (p.sent === 0) {
    const firstError = res.items.map((i) => i.lastError ?? i.skipReason).find(Boolean);
    return { kind: "error", title: "Chưa gửi được thư báo cáo", description: `${periodLabel}: ${firstError ? `${firstError} ` : ""}${hint}` };
  }
  return { kind: "warning", title: `Đã gửi ${n(p.sent)}/${n(p.total)} thư báo cáo${notSent ? ` · ${notSent}` : ""}`, description: `${periodLabel}: ${hint}` };
}
