/**
 * "Gửi email" of Báo cáo tuần/tháng: POST /api/reports/mail queues one REPORT job per target in one batch (+ audit
 * SEND_REPORT_EMAIL, counts only), GET /api/mail/batches/:id reports the progress of a batch.
 *
 * Rules of a send (checked before anything is written):
 * - report.send + level; mail configured (409 otherwise);
 * - the period is a real week (Monday) / month of the level calendar (400);
 * - every target is a recipient the caller may address on the report screen (recipientOptions, 403);
 * - every recipient – and the caller's own address when "Gửi bản sao cho tôi" – inside the allowed domains (400 listing
 *   the blocked ones); cc = settings.report.cc (allowed ones) ∪ the caller; ≤ MAIL_MAX_RECIPIENTS per message;
 * - at most REPORT_MAIL_RATE sends per user (429; every job renders a PDF in Chromium and sends from the one mailbox);
 * - the school-wide daily recipient budget of the mailbox (budget.ts, MAIL_DAILY_REPORT_RECIPIENTS; 429, nothing
 *   queued), charged in the transaction that creates the jobs.
 * Jobs are created in target order with increasing timestamps (the drain sends the oldest first).
 */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { recipientOptions } from "@/components/report/lib/report-model";
import { MAIL_JOB_KIND_LABELS, MAIL_JOB_STATUS_LABELS, MAIL_MAX_RECIPIENTS, MAIL_MAX_TARGETS } from "../../constants";
import type { MailBatchItem, MailBatchResponse, ReportMailSendResponse, ReportMailSendSchema } from "../../contract";
import { COL, mailJobId } from "../../firestore-paths";
import { dedupeEmails, isAllowedDomain, normalizeEmail, partitionByDomain } from "../../mail/address";
import type { MailJob, MailJobStatus, ReportJobPayload } from "../../types";
import { auditOf, writeAudit } from "../audit";
import { actorName, requireLevel, requirePermission, type SessionUser } from "../auth";
import { Errors } from "../errors";
import { db } from "../firebase-admin";
import { checkRateLimit } from "../rate-limit";
import { omitEmpty, type ServiceCtx } from "../records";
import { loadReference } from "../reference";
import { assertReportPeriod } from "../report-plans";
import { runTx } from "../write";
import { chargeReportBudget, reportRecipientCost } from "./budget";
import { MAIL_LEASE_MS, compareOldestFirst } from "./job-state";
import { isReportPayload, mailJobRef } from "./outbox";
import { periodInCalendar, REPORT_DATA_MSG } from "./report-data";
import { shortAddressee } from "./report-email";
import { loadMailSettings } from "./settings";
import { mailStatus } from "./transport";

export type ReportMailSendData = z.output<typeof ReportMailSendSchema>;

export const REPORT_SEND_MSG = {
  notConfigured:
    "Chưa cấu hình gửi email: quản trị viên cần khai báo hộp thư gửi (Microsoft 365) trên máy chủ – xem Cài đặt → Email. Bạn vẫn có thể tải PDF và gửi thủ công.",
  forbidden: (keys: readonly string[]) => `Bạn không thể gửi báo cáo cho: ${keys.join(", ")}.`,
  blocked: (emails: readonly string[]) =>
    `Các địa chỉ sau không thuộc tên miền được phép (Cài đặt → Email) nên không gửi được: ${emails.join(", ")}.`,
  tooMany: (addressee: string) => `Thư gửi ${addressee} có quá ${MAIL_MAX_RECIPIENTS} người nhận (kể cả người nhận bản sao).`,
  batchNotFound: "Không tìm thấy lượt gửi email này.",
  rateLimited: "Bạn đã gửi nhiều lượt email báo cáo trong 10 phút vừa qua. Vui lòng thử lại sau ít phút.",
} as const;

/** Accepted sends ("Gửi email") per user and window (per server instance); rejected requests do not count. */
export const REPORT_MAIL_RATE = { limit: 10, windowMs: 10 * 60_000 } as const;

/* ---------------------------------- send ---------------------------------- */

interface PlannedJob {
  to: string;
  addressee: string;
  recipients: string[];
  cc: string[];
}

/** Recipients of each message after the domain / size rules (pure; throws the 400 of the route). */
export function planReportTargets(
  targets: ReadonlyArray<{ to: string; addressee: string; recipients: readonly string[] }>,
  opts: { domains: readonly string[]; settingsCc: readonly string[]; selfCc?: string },
): PlannedJob[] {
  const self = opts.selfCc ? normalizeEmail(opts.selfCc) : undefined;
  const blocked = dedupeEmails([
    ...targets.flatMap((t) => partitionByDomain(t.recipients, opts.domains).blocked),
    ...(self && !isAllowedDomain(self, opts.domains) ? [self] : []),
  ]);
  if (blocked.length > 0) throw Errors.validation(REPORT_SEND_MSG.blocked(blocked), { blocked });
  // Settings CC addresses outside the domains were reported by the recipients endpoint; they are left out silently.
  const cc = dedupeEmails([...partitionByDomain(opts.settingsCc, opts.domains).allowed, ...(self ? [self] : [])]);
  return targets.map((t) => {
    const recipients = dedupeEmails(t.recipients);
    const jobCc = cc.filter((e) => !recipients.includes(e));
    if (recipients.length + jobCc.length > MAIL_MAX_RECIPIENTS) throw Errors.validation(REPORT_SEND_MSG.tooMany(t.addressee));
    return { to: t.to, addressee: t.addressee, recipients, cc: jobCc };
  });
}

/**
 * POST /api/reports/mail: validates, queues the jobs + audit in one transaction with the daily recipient budget,
 * returns the batch id. The caller schedules the drain (scheduleDrain) once the response is sent. `origin` = request
 * origin (base URL fallback).
 */
export async function queueReportMail(ctx: ServiceCtx, input: ReportMailSendData, origin?: string): Promise<ReportMailSendResponse> {
  const { user } = ctx;
  requirePermission(user, "report.send");
  requireLevel(user, input.levelId);
  assertReportPeriod(input.mode, input.key);
  const { levelId, mode, key } = input;
  const [settings, ref] = await Promise.all([loadMailSettings(levelId), loadReference(levelId)]);
  const status = mailStatus(origin, settings.allowedDomains);
  if (!status.configured) throw Errors.conflict(REPORT_SEND_MSG.notConfigured);
  if (!periodInCalendar({ mode, key }, ref.weeks)) throw Errors.validation(REPORT_DATA_MSG.period, [{ path: "key", message: REPORT_DATA_MSG.period }]);

  const options = new Map(recipientOptions(user.profile, { levelId, classes: ref.classes }).map((o) => [o.key, o] as const));
  const forbidden = input.targets.filter((t) => !options.has(t.to)).map((t) => t.to);
  if (forbidden.length > 0) throw Errors.forbidden(REPORT_SEND_MSG.forbidden(forbidden));
  const targets = input.targets.flatMap((t) => {
    const option = options.get(t.to);
    return option ? [{ to: t.to, addressee: shortAddressee(option), recipients: t.recipients }] : [];
  });
  const planned = planReportTargets(targets, { domains: status.allowedDomains, settingsCc: settings.report.cc, selfCc: input.ccSelf ? user.email : undefined });
  const rate = checkRateLimit(`report-mail:${user.uid}`, REPORT_MAIL_RATE.limit, REPORT_MAIL_RATE.windowMs);
  if (!rate.ok) throw Errors.rateLimited(rate.retryAfterSec, REPORT_SEND_MSG.rateLimited);

  const batchId = randomUUID();
  const now = Date.now();
  const by = actorName(user);
  const note = input.note?.trim();
  const jobs: MailJob[] = planned.map((p, i) => {
    const at = now - (planned.length - 1 - i); // first target = oldest job = sent first; none in the future
    const iso = new Date(at).toISOString();
    const payload = omitEmpty<ReportJobPayload>(
      { mode, key, to: p.to, detail: input.detail, addressee: p.addressee, note, viewerUid: user.uid, preparedBy: by },
      ["note"],
    );
    return {
      id: mailJobId(at),
      levelId,
      kind: "REPORT",
      status: "PENDING",
      to: p.recipients,
      cc: p.cc,
      payload,
      batchId,
      attempts: 0,
      nextAttemptAt: iso,
      createdAt: iso,
      createdBy: user.uid,
      createdByName: by,
    };
  });
  const recipients = dedupeEmails(planned.flatMap((p) => [...p.recipients, ...p.cc])).length;
  const audit = auditOf(user, "SEND_REPORT_EMAIL", {
    entity: "mailBatch",
    entityId: batchId,
    levelId,
    ip: ctx.ip,
    detail: { mode, key, targets: planned.length, recipients, detail: input.detail, ccSelf: input.ccSelf },
  });
  await runTx(async (tx) => {
    await chargeReportBudget(tx, reportRecipientCost(planned), now);
    for (const job of jobs) tx.create(mailJobRef(job.id), job);
    writeAudit(tx, audit);
  });
  return { batchId, jobs: planned.length };
}

/* ---------------------------------- batch --------------------------------- */

/** A batch with due PENDING jobs and no sign of a drain for this long gets a new drain (GET /api/mail/batches/:id). */
export const BATCH_STALL_MS = 20_000;
const BATCH_ID_RE = /^[\w-]{8,80}$/;

const STATUSES = Object.keys(MAIL_JOB_STATUS_LABELS) as MailJobStatus[];
const time = (iso: string | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** MailBatchResponse of the jobs of one batch (pure). */
export function batchView(batchId: string, jobs: readonly MailJob[]): MailBatchResponse {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<MailJobStatus, number>;
  // Send order of the drain: oldest first.
  const items: MailBatchItem[] = [...jobs].sort(compareOldestFirst).map((j) => {
    counts[j.status] += 1;
    const item: MailBatchItem = { id: j.id, to: j.to, addressee: isReportPayload(j.payload) ? j.payload.addressee : MAIL_JOB_KIND_LABELS[j.kind], status: j.status };
    if (j.lastError) item.lastError = j.lastError;
    if (j.skipReason) item.skipReason = j.skipReason;
    if (j.sentAt) item.sentAt = j.sentAt;
    return item;
  });
  return { batchId, items, counts, done: counts.PENDING === 0 && counts.SENDING === 0 };
}

/**
 * True when the batch needs a new drain (pure): a PENDING job has been due for BATCH_STALL_MS (or a SENDING job's
 * lease expired), no job is SENDING under a live lease, and nothing happened in the batch (creation, claim = leaseUntil
 * − MAIL_LEASE_MS, send) for BATCH_STALL_MS – the first drain ended early.
 */
export function batchNeedsDrain(jobs: readonly MailJob[], now: number = Date.now()): boolean {
  const stalledSince = now - BATCH_STALL_MS;
  if (jobs.some((j) => j.status === "SENDING" && time(j.leaseUntil) > now)) return false;
  const lastActivity = Math.max(0, ...jobs.map((j) => Math.max(time(j.createdAt), time(j.sentAt), j.leaseUntil ? time(j.leaseUntil) - MAIL_LEASE_MS : 0)));
  if (lastActivity > stalledSince) return false;
  return jobs.some((j) => (j.status === "PENDING" && time(j.nextAttemptAt) <= stalledSince) || (j.status === "SENDING" && time(j.leaseUntil) <= now));
}

/** GET /api/mail/batches/:id (report.send + level of the jobs): the batch and whether to schedule a drain again. */
export async function readReportBatch(user: SessionUser, batchId: string, now: number = Date.now()): Promise<{ view: MailBatchResponse; needsDrain: boolean }> {
  requirePermission(user, "report.send");
  if (!BATCH_ID_RE.test(batchId)) throw Errors.notFound(REPORT_SEND_MSG.batchNotFound);
  const snap = await db().collection(COL.mailOutbox).where("batchId", "==", batchId).limit(MAIL_MAX_TARGETS).get();
  const jobs = snap.docs.map((d) => d.data() as MailJob);
  if (jobs.length === 0) throw Errors.notFound(REPORT_SEND_MSG.batchNotFound);
  for (const levelId of new Set(jobs.map((j) => j.levelId))) requireLevel(user, levelId);
  return { view: batchView(batchId, jobs), needsDrain: batchNeedsDrain(jobs, now) };
}
