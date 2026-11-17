/**
 * GET /api/cron/mail (Vercel cron, once a day; `Authorization: Bearer ${CRON_SECRET}`): deletes print jobs older than
 * 1 h and the daily recipient counters of older days (mailBudget), then drains every job kind (catch-up of notices /
 * reports whose first drain ended early, retries in backoff).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { MailCronResponse } from "../../contract";
import { bearerToken } from "../auth";
import { deleteOldMailBudgets } from "./budget";
import { ALL_MAIL_KINDS, LONG_DRAIN_MS, drainMail, type DrainOptions } from "./drain";
import { deleteStalePrintJobs } from "./print-jobs";

export const CRON_MSG = {
  unauthorized: "Không được phép gọi tác vụ định kỳ gửi thư.",
} as const;

const sha256 = (s: string): Buffer => createHash("sha256").update(s, "utf8").digest();

/** `Authorization: Bearer <CRON_SECRET>` (constant-time comparison); always false when CRON_SECRET is not set. */
export function isCronAuthorized(req: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.CRON_SECRET?.trim();
  const token = bearerToken(req);
  if (!secret || !token) return false;
  return timingSafeEqual(sha256(token), sha256(secret));
}

/**
 * The cron run: stale print jobs (> 1 h) and old daily recipient counters deleted, then everything drained within
 * LONG_DRAIN_MS counted from `startedAt` (the start of the request, like the other 300 s routes; default: now). Never
 * throws.
 */
export async function runMailCron(opts: Pick<DrainOptions, "builders" | "baseUrl" | "startedAt">): Promise<MailCronResponse> {
  const startedAt = opts.startedAt ?? Date.now();
  let printJobsDeleted = 0;
  try {
    printJobsDeleted = await deleteStalePrintJobs();
  } catch (e) {
    console.error("[mail] cron: cannot delete stale print jobs:", e);
  }
  try {
    await deleteOldMailBudgets();
  } catch (e) {
    console.error("[mail] cron: cannot delete old recipient counters:", e);
  }
  const result = await drainMail({ kinds: [...ALL_MAIL_KINDS], builders: opts.builders, deadlineMs: LONG_DRAIN_MS, startedAt, baseUrl: opts.baseUrl });
  return { ok: true, ...result, printJobsDeleted };
}
