/**
 * School-wide daily budget of report email recipients (doc mailBudget/{yyyy-mm-dd}, VN day). Every level sends from the
 * one shared mailbox, and Exchange Online blocks a mailbox for about a day past ~10,000 recipients per 24 h – which
 * would also stop every GVCN notice. "Gửi email" of Báo cáo tuần/tháng therefore charges Σ(to + cc) of its messages to
 * the counter of the day, in the transaction that queues them, and is refused (429, nothing queued) when the day's
 * total would exceed MAIL_DAILY_REPORT_RECIPIENTS. Per VN day rather than rolling 24 h: at worst two full days fall
 * into one 24 h window (2 × 3,000), still well below the mailbox limit. Retries of a queued message are not charged
 * again (they were charged when queued). Server-only (firestore.rules deny every client access); the cron deletes the
 * counters of older days.
 */
import type { Transaction } from "firebase-admin/firestore";
import { MAIL_DAILY_REPORT_RECIPIENTS } from "../../constants";
import { addDays, todayVN } from "../../engine/dates";
import { COL } from "../../firestore-paths";
import { Errors } from "../errors";
import { db } from "../firebase-admin";
import { BATCH_LIMIT } from "../write";

export interface MailBudgetDoc {
  /** VN day, yyyy-mm-dd (= the doc id). */
  day: string;
  /** Recipients (to + cc of every message) of the report emails queued that day, all levels. */
  reportRecipients: number;
  updatedAt: string;
}

/** Counters of days older than this many days before today are deleted by the cron. */
export const MAIL_BUDGET_KEEP_DAYS = 2;

const vn = (n: number) => n.toLocaleString("vi-VN");

export const MAIL_BUDGET_MSG = {
  exceeded: (cost: number, left: number) =>
    `Hộp thư gửi của trường đã gần hết hạn mức thư báo cáo hôm nay (tối đa ${vn(MAIL_DAILY_REPORT_RECIPIENTS)} lượt người nhận mỗi ngày ` +
    `cho tất cả các cấp): lượt gửi này cần ${vn(cost)} lượt người nhận, hôm nay chỉ còn ${vn(left)}. ` +
    "Vui lòng bớt người nhận hoặc gửi lại vào ngày mai.",
} as const;

export function mailBudgetRef(day: string) {
  return db().collection(COL.mailBudget).doc(day);
}

/** Recipients a set of messages costs (pure): to + cc of each message – Exchange counts every message separately. */
export function reportRecipientCost(messages: ReadonlyArray<{ recipients: readonly string[]; cc: readonly string[] }>): number {
  return messages.reduce((sum, m) => sum + m.recipients.length + m.cc.length, 0);
}

/** Seconds until the next VN midnight (Retry-After of a refused send), at least 1. */
export function secondsUntilNextVnDay(now: number = Date.now()): number {
  const DAY = 86_400_000;
  const OFFSET = 7 * 3_600_000;
  const nextMidnight = (Math.floor((now + OFFSET) / DAY) + 1) * DAY - OFFSET;
  return Math.max(1, Math.ceil((nextMidnight - now) / 1000));
}

/**
 * Inside the transaction that queues the messages (reads first): adds `cost` to today's counter, or throws 429
 * RATE_LIMITED (Vietnamese message, Retry-After = next VN midnight) when the day would go over
 * MAIL_DAILY_REPORT_RECIPIENTS – the transaction then writes nothing.
 */
export async function chargeReportBudget(tx: Transaction, cost: number, now: number = Date.now()): Promise<MailBudgetDoc> {
  const day = todayVN(new Date(now));
  const ref = mailBudgetRef(day);
  const snap = await tx.get(ref);
  const stored: unknown = snap.get("reportRecipients");
  const used = typeof stored === "number" && Number.isFinite(stored) ? stored : 0;
  if (used + cost > MAIL_DAILY_REPORT_RECIPIENTS) {
    throw Errors.rateLimited(secondsUntilNextVnDay(now), MAIL_BUDGET_MSG.exceeded(cost, Math.max(0, MAIL_DAILY_REPORT_RECIPIENTS - used)));
  }
  const doc: MailBudgetDoc = { day, reportRecipients: used + cost, updatedAt: new Date(now).toISOString() };
  tx.set(ref, doc);
  return doc;
}

/** Deletes the counters of days before today − MAIL_BUDGET_KEEP_DAYS (cron); returns how many were deleted. */
export async function deleteOldMailBudgets(now: number = Date.now()): Promise<number> {
  const cutoff = addDays(todayVN(new Date(now)), -MAIL_BUDGET_KEEP_DAYS);
  let deleted = 0;
  for (;;) {
    const snap = await db().collection(COL.mailBudget).where("day", "<", cutoff).limit(BATCH_LIMIT).get();
    if (snap.empty) return deleted;
    const batch = db().batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < BATCH_LIMIT) return deleted;
  }
}
