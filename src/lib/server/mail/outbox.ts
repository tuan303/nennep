/**
 * Outbox (mailOutbox): what gets queued and how jobs are listed / re-queued.
 *
 * GVCN notices (decision 2 of the email spec): one NOTICE job per (record change × class), written in the SAME
 * transaction as the incident / reward change, only when
 *   - the call comes from an incident / reward route (`ctx.onMailQueued` set – scripts, seeds, imports never notify),
 *   - the actor is staff (role ≠ GVCN),
 *   - the transport is configured and Cài đặt → Email has notices on for that kind (checked BEFORE the transaction),
 *   - the change is score-relevant (planRecordNotices).
 * Recipients are resolved when the job is sent (buildNoticeJob), so a GVCN added later still gets queued notices.
 * buildNoticeJob is the NOTICE builder of every drain (routes schedule it through notice-drain.ts).
 */
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { LEVELS, LEVEL_IDS, MAIL_JOB_KIND_LABELS, MAIL_MAX_RECIPIENTS, hasPermission } from "../../constants";
import type { MailJobView } from "../../contract";
import { formatMonthLabel, formatWeekLabel } from "../../engine/dates";
import { COL, mailJobId } from "../../firestore-paths";
import { incidentNoticeFields, isRewardCounted, noticeChangeLabels, rewardNoticeFields, type NoticeRecordKind } from "../../mail/policy";
import type {
  Incident,
  LevelId,
  MailJob,
  MailJobPayload,
  NoticeEvent,
  NoticePayload,
  NoticeSnapshot,
  ReportJobPayload,
  Reward,
  RewardStatus,
  TestJobPayload,
} from "../../types";
import { auditOf, writeAudit } from "../audit";
import { actorName, requireLevel, type SessionUser } from "../auth";
import { Errors } from "../errors";
import { db } from "../firebase-admin";
import { enforceRateLimit } from "../rate-limit";
import { omitEmpty, type ServiceCtx } from "../records";
import { runTx } from "../write";
import { RETRYABLE_STATUSES, claimJob, requeuedJob } from "./job-state";
import { buildNoticeMail } from "./notice-email";
import { classRecipients } from "./recipients";
import { loadMailSettings } from "./settings";
import { mailTransport } from "./transport";
import type { JobBuilder } from "./types";

export const OUTBOX_MSG = {
  notFound: "Không tìm thấy thư trong nhật ký gửi thư.",
  retryForbidden: "Bạn chỉ được gửi lại thư do chính mình gửi (hoặc cần quyền quản lý cài đặt).",
  retryStatus: "Chỉ gửi lại được thư bị lỗi hoặc bị bỏ qua.",
} as const;

/** Side channel of the incident / reward services (their return shapes stay unchanged). */
export interface NoticeCtx {
  /**
   * Set by the incident / reward routes: GVCN notices are queued only for these calls. Called once after the commit
   * when the committed transaction queued at least one notice (the route then schedules a drain).
   */
  onMailQueued?: () => void;
}

export function mailJobRef(id: string): DocumentReference {
  return db().collection(COL.mailOutbox).doc(id);
}

/** Level of a record doc id `${levelId}_${code}` (undefined when the prefix is not a level). */
export function levelOfRecordId(id: string): LevelId | undefined {
  const prefix = id.slice(0, Math.max(0, id.indexOf("_")));
  return LEVEL_IDS.find((l) => l === prefix);
}

/* --------------------------------- payloads -------------------------------- */

export function isNoticePayload(p: MailJobPayload): p is NoticePayload {
  return "event" in p && "snapshot" in p;
}

export function isReportPayload(p: MailJobPayload): p is ReportJobPayload {
  return "mode" in p && "addressee" in p;
}

export function isTestPayload(p: MailJobPayload): p is TestJobPayload {
  return "kind" in p && p.kind === "TEST";
}

/** Everything a notice shows about an incident. */
export function incidentSnapshot(i: Incident): NoticeSnapshot {
  return omitEmpty<NoticeSnapshot>(
    {
      record: "incident",
      recordId: i.id,
      code: i.code,
      date: i.date,
      week: i.week,
      classCode: i.classCode,
      grade: i.grade,
      title: i.issue,
      errorCode: i.errorCode,
      category: i.category,
      group: i.group,
      unit: i.unit,
      scope: i.scope,
      occurrenceCount: i.occurrenceCount,
      points: Math.max(0, i.points),
      students: i.students.map((s) => s.name).filter((n) => n.trim() !== ""),
      unnamedCount: i.unnamedCount > 0 ? i.unnamedCount : undefined,
      detail: i.detail,
      reporter: i.reporter,
      status: i.status,
    },
    ["errorCode", "category", "group", "detail", "reporter", "unnamedCount"],
  );
}

/** Everything a notice shows about a reward (`counted`: its status is counted in the competition score). */
export function rewardSnapshot(r: Reward, countedStatuses: readonly RewardStatus[]): NoticeSnapshot {
  return omitEmpty<NoticeSnapshot>(
    {
      record: "reward",
      recordId: r.id,
      code: r.code,
      date: r.date,
      week: r.week,
      classCode: r.classCode,
      grade: r.grade,
      title: r.reason,
      points: Math.max(0, r.points),
      students: [],
      detail: r.note,
      reporter: r.reporter,
      status: r.status,
      counted: isRewardCounted(r.status, countedStatuses),
    },
    ["detail", "reporter"],
  );
}

export interface NoticePlanCtx {
  actorName: string;
  /** Rewards: config.rewardCountedStatuses of the level. */
  countedStatuses?: readonly RewardStatus[];
}

const isLive = <T extends { deletedAt?: string }>(r: T | undefined): r is T => r !== undefined && !r.deletedAt;

function noticePayload(event: NoticeEvent, snapshot: NoticeSnapshot, ctx: NoticePlanCtx, extra: Pick<NoticePayload, "changes" | "movedTo"> = {}): NoticePayload {
  const p: NoticePayload = { event, snapshot, actorName: ctx.actorName };
  if (extra.changes && extra.changes.length > 0) p.changes = extra.changes;
  if (extra.movedTo) p.movedTo = extra.movedTo;
  return p;
}

/**
 * Notices of one record change (pure). `before` undefined = created; `deletedAt` marks soft-deleted versions.
 * - created → CREATED; live → deleted → DELETED; deleted → live → RESTORED;
 * - edit with score-relevant changes: class changed → MOVED_OUT (old class, old snapshot) + CREATED (new class);
 *   reward moved INTO a counted status → CONFIRMED; otherwise UPDATED with the Vietnamese labels of the changes.
 */
export function planRecordNotices(kind: "incident", before: Incident | undefined, after: Incident | undefined, ctx: NoticePlanCtx): NoticePayload[];
export function planRecordNotices(kind: "reward", before: Reward | undefined, after: Reward | undefined, ctx: NoticePlanCtx): NoticePayload[];
export function planRecordNotices(kind: NoticeRecordKind, before: Incident | Reward | undefined, after: Incident | Reward | undefined, ctx: NoticePlanCtx): NoticePayload[] {
  const counted = ctx.countedStatuses ?? [];
  const snap = (r: Incident | Reward): NoticeSnapshot => (kind === "incident" ? incidentSnapshot(r as Incident) : rewardSnapshot(r as Reward, counted));
  if (!isLive(after)) return isLive(before) ? [noticePayload("DELETED", snap(before), ctx)] : [];
  if (!before) return [noticePayload("CREATED", snap(after), ctx)];
  if (before.deletedAt) return [noticePayload("RESTORED", snap(after), ctx)];

  const fields: string[] = kind === "incident" ? incidentNoticeFields(before as Incident, after as Incident) : rewardNoticeFields(before as Reward, after as Reward, counted);
  if (fields.length === 0) return [];
  if (before.classCode !== after.classCode) {
    return [noticePayload("MOVED_OUT", snap(before), ctx, { movedTo: after.classCode }), noticePayload("CREATED", snap(after), ctx)];
  }
  if (kind === "reward" && fields.includes("status") && isRewardCounted((after as Reward).status, counted)) {
    return [noticePayload("CONFIRMED", snap(after), ctx, { changes: noticeChangeLabels(kind, fields.filter((f) => f !== "status")) })];
  }
  return [noticePayload("UPDATED", snap(after), ctx, { changes: noticeChangeLabels(kind, fields) })];
}

/* ------------------------------ queueing notices ----------------------------- */

/** A queued NOTICE job (pure): recipients are resolved when it is sent. */
export function noticeJob(levelId: LevelId, p: NoticePayload, user: SessionUser, nowMs: number = Date.now(), random?: () => number): MailJob {
  const now = new Date(nowMs).toISOString();
  return {
    id: mailJobId(nowMs, random),
    levelId,
    kind: "NOTICE",
    status: "PENDING",
    to: [],
    cc: [],
    payload: p,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    createdBy: user.uid,
    createdByName: actorName(user),
  };
}

/** WRITE phase: create one PENDING job per payload; returns how many were queued. */
export function writeNoticeJobs(tx: Transaction, levelId: LevelId, payloads: readonly NoticePayload[], user: SessionUser): number {
  const now = Date.now();
  for (const p of payloads) {
    const job = noticeJob(levelId, p, user, now);
    tx.create(mailJobRef(job.id), job);
  }
  return payloads.length;
}

const NO_NOTICES: Readonly<Record<NoticeRecordKind, boolean>> = { incident: false, reward: false };

/**
 * Which notice kinds a level sends right now: transport configured && notices enabled && kind ticked. Never throws
 * (a failing settings read must not block scoring: no notices then).
 */
export async function noticeConfig(levelId: LevelId): Promise<Readonly<Record<NoticeRecordKind, boolean>>> {
  if (!mailTransport().configured) return NO_NOTICES;
  try {
    const { notices } = await loadMailSettings(levelId);
    return { incident: notices.enabled && notices.incidents, reward: notices.enabled && notices.rewards };
  } catch (e) {
    console.error("[mail] cannot read mail settings, notices skipped:", e);
    return NO_NOTICES;
  }
}

export interface NoticeQueue {
  /** Notices of this kind will be written for this level (route call, staff actor, configured, enabled). */
  readonly enabled: boolean;
  /** WRITE phase: queue `payloads` for a record of `levelId` (no-op when disabled or for another level). */
  write(tx: Transaction, levelId: LevelId, payloads: readonly NoticePayload[]): void;
}

/**
 * `runTx` for an incident / reward mutation that may queue notices: decides BEFORE the transaction whether notices are
 * on, hands `fn` a NoticeQueue, and calls `ctx.onMailQueued` after the commit when the committed attempt queued jobs.
 */
export async function withNotices<T>(
  ctx: ServiceCtx & NoticeCtx,
  levelId: LevelId | undefined,
  kind: NoticeRecordKind,
  fn: (tx: Transaction, notices: NoticeQueue) => Promise<T>,
): Promise<T> {
  const wanted = Boolean(ctx.onMailQueued) && levelId !== undefined && ctx.user.profile.role !== "GVCN";
  const enabled = wanted && levelId !== undefined ? (await noticeConfig(levelId))[kind] : false;
  let queued = 0;
  const result = await runTx(async (tx) => {
    queued = 0; // a retried attempt starts over
    const notices: NoticeQueue = {
      enabled,
      write(wtx, recordLevel, payloads) {
        if (!enabled || recordLevel !== levelId || payloads.length === 0) return;
        queued += writeNoticeJobs(wtx, recordLevel, payloads, ctx.user);
      },
    };
    return fn(tx, notices);
  });
  if (queued > 0) {
    try {
      ctx.onMailQueued?.();
    } catch (e) {
      console.error("[mail] cannot schedule the notice drain:", e);
    }
  }
  return result;
}

/* ------------------------------ NOTICE builder ------------------------------ */

export const NOTICE_JOB_MSG = {
  badPayload: "Thư thông báo thiếu nội dung.",
  disabled: "Thông báo cho GVCN đang tắt (Cài đặt → Email).",
  noRecipient: (classCode: string) => `Lớp ${classCode} chưa có email GVCN (tài khoản GVCN hoặc Cài đặt → Lớp).`,
  blocked: (classCode: string, blocked: readonly string[]) => `Email GVCN lớp ${classCode} không thuộc tên miền được phép: ${blocked.join(", ")}.`,
} as const;

/**
 * NOTICE builder: skipped when notices were turned off since the job was queued, or when the class has no allowed
 * GVCN address (recipients.ts); otherwise the notice email of the payload snapshot to the class's GVCN(s).
 */
export const buildNoticeJob: JobBuilder = async (job, ctx) => {
  if (!isNoticePayload(job.payload)) return { skip: NOTICE_JOB_MSG.badPayload };
  const notice = job.payload;
  const { classCode, record } = notice.snapshot;
  const settings = await loadMailSettings(job.levelId);
  const kindOn = record === "incident" ? settings.notices.incidents : settings.notices.rewards;
  if (!settings.notices.enabled || !kindOn) return { skip: NOTICE_JOB_MSG.disabled };
  const { allowed, blocked } = await classRecipients(job.levelId, classCode, settings, ctx.cache);
  if (allowed.length === 0) return { skip: blocked.length > 0 ? NOTICE_JOB_MSG.blocked(classCode, blocked) : NOTICE_JOB_MSG.noRecipient(classCode) };
  const content = buildNoticeMail(notice, { baseUrl: ctx.baseUrl, levelId: job.levelId, levelName: LEVELS[job.levelId].name });
  return { mail: { to: allowed.slice(0, MAIL_MAX_RECIPIENTS), cc: [], ...content } };
};

/* ------------------------------------ log ----------------------------------- */

const NOTICE_EVENT_SUFFIX: Record<NoticeEvent, (p: NoticePayload) => string> = {
  CREATED: () => "",
  UPDATED: () => " · điều chỉnh",
  DELETED: () => " · hủy ghi nhận",
  RESTORED: () => " · khôi phục",
  MOVED_OUT: (p) => ` · chuyển sang ${p.movedTo ?? "lớp khác"}`,
  CONFIRMED: () => " · xác nhận",
};

function reportPeriodLabel(p: ReportJobPayload): string {
  return p.mode === "week" ? `Tuần ${formatWeekLabel(p.key)}` : formatMonthLabel(p.key);
}

/** One-line Vietnamese label of a job for the mail log. */
export function mailJobLabel(job: Pick<MailJob, "kind" | "payload">): string {
  const kind = MAIL_JOB_KIND_LABELS[job.kind];
  const p = job.payload;
  if (job.kind === "NOTICE" && isNoticePayload(p)) return `${kind} · ${p.snapshot.classCode} · ${p.snapshot.code}${NOTICE_EVENT_SUFFIX[p.event](p)}`;
  if (job.kind === "REPORT" && isReportPayload(p)) return `${kind} · ${p.addressee} · ${reportPeriodLabel(p)}`;
  return kind;
}

/** MailJob → MailJobView (payload dropped, label added). */
export function toMailJobView(job: MailJob): MailJobView {
  const { payload: _payload, ...rest } = job;
  return { ...rest, label: mailJobLabel(job) };
}

/** Latest jobs of a level, newest first (ids are inverted timestamps: no index needed). */
export async function listMailLog(user: SessionUser, levelId: LevelId, limit: number): Promise<MailJobView[]> {
  requireLevel(user, levelId);
  const snap = await db().collection(COL.mailOutbox).where("levelId", "==", levelId).limit(limit).get();
  return snap.docs.map((d) => toMailJobView(d.data() as MailJob));
}

/* --------------------------------- test mail --------------------------------- */

/**
 * "Gửi thư thử tới tôi": a TEST job to the caller, created already claimed (SENDING, attempt 1) so that no drain picks
 * it up while the route sends it; audit SEND_TEST_EMAIL in the same batch. Should the route die mid-send, the next
 * drain marks it FAILED once the lease expired (claimJob) – a test message is never sent later.
 */
export async function createTestJob(ctx: ServiceCtx, levelId: LevelId, to: string, nowMs: number = Date.now()): Promise<MailJob> {
  const { user } = ctx;
  const now = new Date(nowMs).toISOString();
  const queued: MailJob = {
    id: mailJobId(nowMs),
    levelId,
    kind: "TEST",
    status: "PENDING",
    to: [to],
    cc: [],
    payload: { kind: "TEST" },
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    createdBy: user.uid,
    createdByName: actorName(user),
  };
  const claimed = claimJob(queued, nowMs);
  const job = claimed?.kind === "claimed" ? claimed.job : queued;
  const batch = db().batch();
  batch.create(mailJobRef(job.id), job);
  writeAudit(batch, auditOf(user, "SEND_TEST_EMAIL", { entity: "mailJob", entityId: job.id, levelId, ip: ctx.ip }));
  await batch.commit();
  return job;
}

/* ---------------------------------- retry ---------------------------------- */

/** "Gửi lại" per user and window (per server instance): each one may start a drain with Chromium and a Graph send. */
export const MAIL_RETRY_RATE = { limit: 30, windowMs: 10 * 60_000 } as const;

/**
 * "Gửi lại" (POST /api/mail/jobs/:id/retry): FAILED / SKIPPED → PENDING now with attempts 0 (409 otherwise). Allowed
 * with settings.manage, or with report.send for one's own jobs; level access required; at most MAIL_RETRY_RATE per
 * user (429). Audit RETRY_EMAIL.
 */
export async function retryMailJob(ctx: ServiceCtx, id: string): Promise<MailJob> {
  const { user } = ctx;
  enforceRateLimit(`mail-retry:${user.uid}`, MAIL_RETRY_RATE.limit, MAIL_RETRY_RATE.windowMs);
  return runTx(async (tx) => {
    const snap = await tx.get(mailJobRef(id));
    if (!snap.exists) throw Errors.notFound(OUTBOX_MSG.notFound);
    const job = snap.data() as MailJob;
    requireLevel(user, job.levelId);
    const own = hasPermission(user.profile, "report.send") && job.createdBy === user.uid;
    if (!hasPermission(user.profile, "settings.manage") && !own) throw Errors.forbidden(OUTBOX_MSG.retryForbidden);
    if (!RETRYABLE_STATUSES.includes(job.status)) throw Errors.conflict(OUTBOX_MSG.retryStatus);
    const next = requeuedJob(job, Date.now());
    tx.set(mailJobRef(id), next);
    writeAudit(
      tx,
      auditOf(user, "RETRY_EMAIL", { entity: "mailJob", entityId: id, levelId: job.levelId, ip: ctx.ip, detail: { kind: job.kind, status: job.status, attempts: job.attempts } }),
    );
    return next;
  });
}
