/**
 * Reward (điểm thưởng) service: one transaction per mutation (reward doc + monthly reward digest + versions + audit).
 * "Đã xác nhận" status (counted in rankings) requires `reward.verify`. Like incidents: dates must be in a calendar
 * week, every mutation increments `rev` (PATCH `baseRev` → 409 when stale), photos are linked to the record.
 * REQ_V2 §5.3: new rewards carry an integer 1–5 (`REWARD_POINT_LEVELS`) and a reason ≥ 5 chars; edits apply those
 * rules only to CHANGED points / reason (legacy values stay valid while unchanged). Callers with `reward.propose`
 * but without `reward.create` (GVCN) propose rewards for their own classes: status "Mới ghi nhận", `proposed: true`.
 */
import type { DocumentReference } from "firebase-admin/firestore";
import type { z } from "zod";
import { REWARD_POINT_LEVELS, REWARD_REASON_MIN_LENGTH, hasPermission, isGvcnOfClass } from "../constants";
import type { RewardCreateSchema, RewardUpdateSchema } from "../contract";
import { isIsoDate, todayVN, weekInfo } from "../engine/dates";
import { round2 } from "../engine/scoring";
import { COL } from "../firestore-paths";
import type { LevelId, Reward, RewardStatus } from "../types";
import { auditDiff, auditOf, writeAudit } from "./audit";
import { actorName, requireAnyPermission, requireLevel, requirePermission, type SessionUser } from "./auth";
import { assertRestorableWeek, calendarProblem } from "./calendar";
import { loadRewardDigests } from "./digests";
import { Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";
import { commitCode, nextCode } from "./ids";
import {
  assertBaseRev,
  assertCanEditRecord,
  assertEvidenceIds,
  assertHttpUrls,
  nextRev,
  omitEmpty,
  planEvidenceLinks,
  readIdempotency,
  writeEvidenceLinks,
  writeIdempotency,
  type ServiceCtx,
} from "./records";
import { findClass, loadReference, type LevelReference } from "./reference";
import { bumpVersions } from "./versions";
import { readDoc, runTx, type Reader } from "./write";

export type RewardCreateData = z.output<typeof RewardCreateSchema>;
export type RewardUpdateData = z.output<typeof RewardUpdateSchema>;

export const VERIFIED_STATUS: RewardStatus = "Đã xác nhận";

export const REWARD_MSG = {
  notFound: "Không tìm thấy điểm thưởng.",
  deleted: "Điểm thưởng này đã bị xóa.",
  alreadyDeleted: "Điểm thưởng này đã bị xóa trước đó.",
  notDeleted: "Điểm thưởng này chưa bị xóa nên không cần khôi phục.",
  verifyOnly: "Chỉ quản trị viên được chuyển điểm thưởng sang trạng thái \"Đã xác nhận\".",
  verifiedLocked: "Điểm thưởng đã được xác nhận; chỉ quản trị viên được chỉnh sửa.",
  futureDate: "Không thể ghi nhận điểm thưởng ở ngày trong tương lai.",
  invalidDate: "Ngày không hợp lệ.",
  invalidPoints: "Điểm thưởng phải lớn hơn 0.",
  pointLevels: "Mức điểm cộng là số nguyên từ 1 đến 5 (mức cũ được giữ nếu không sửa).",
  reasonShort: `Nhập lý do cộng điểm (tối thiểu ${REWARD_REASON_MIN_LENGTH} ký tự).`,
  proposeOwnClass: "GVCN chỉ được đề xuất điểm thưởng cho lớp mình chủ nhiệm.",
  stale: "Điểm thưởng đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại để xem bản mới nhất rồi sửa tiếp.",
} as const;

export const REWARD_AUDIT_FIELDS = [
  "date",
  "week",
  "classCode",
  "grade",
  "points",
  "reason",
  "reporter",
  "note",
  "status",
  "evidenceUrls",
  "photoIds",
] as const satisfies ReadonlyArray<keyof Reward>;

const OPTIONAL_KEYS = ["reporter", "note"] as const satisfies ReadonlyArray<keyof Reward>;

/** Proposal status of a GVCN (`reward.propose` without `reward.create`). */
export const PROPOSAL_STATUS: RewardStatus = "Mới ghi nhận";

/** True for an integer of the 1–5 scale (`REWARD_POINT_LEVELS`). */
export function isRewardPointLevel(points: number): boolean {
  return (REWARD_POINT_LEVELS as readonly number[]).includes(points);
}

/** True when the trimmed reason is long enough for a new / changed reward. */
export function isRewardReasonValid(reason: string): boolean {
  return reason.trim().length >= REWARD_REASON_MIN_LENGTH;
}

export function rewardRef(id: string): DocumentReference {
  return db().collection(COL.rewards).doc(id);
}

export async function readReward(reader: Reader, id: string): Promise<Reward> {
  const snap = await readDoc(reader, rewardRef(id));
  if (!snap.exists) throw Errors.notFound(REWARD_MSG.notFound);
  return snap.data() as Reward;
}

/**
 * Rule checks for a reward draft: valid past date inside the calendar weeks, existing active class, points > 0.
 * Returns messages. `checkCalendar: false` skips the calendar rule (an edit that keeps the stored date).
 */
export function validateRewardRules(
  d: { date: string; classCode: string; points: number },
  ref: LevelReference,
  today: string,
  opts: { checkCalendar?: boolean } = {},
): string[] {
  const errors: string[] = [];
  if (!isIsoDate(d.date)) errors.push(REWARD_MSG.invalidDate);
  else if (d.date > today) errors.push(REWARD_MSG.futureDate);
  else if (opts.checkCalendar !== false) {
    const outside = calendarProblem(d.date, ref.weeks);
    if (outside) errors.push(outside);
  }
  const cls = findClass(ref, d.classCode);
  if (!cls) errors.push(`Lớp "${d.classCode}" không có trong danh mục.`);
  else if (!cls.active) errors.push(`Lớp ${cls.code} đã ngừng hoạt động.`);
  if (!(d.points > 0)) errors.push(REWARD_MSG.invalidPoints);
  return errors;
}

function assertStatusChange(user: SessionUser, from: RewardStatus | undefined, to: RewardStatus): void {
  if (from === to) return;
  if ((to === VERIFIED_STATUS || from === VERIFIED_STATUS) && !hasPermission(user.profile, "reward.verify")) {
    throw Errors.forbidden(REWARD_MSG.verifyOnly);
  }
}

function auditDetail(r: Reward): Record<string, unknown> {
  const d: Record<string, unknown> = { code: r.code, date: r.date, classCode: r.classCode, points: r.points, status: r.status, reason: r.reason };
  if (r.proposed) d.proposed = true;
  return d;
}

/**
 * POST /api/rewards (reward.propose). `created: false` when the clientRequestId was already used.
 * Without `reward.create` (GVCN): own classes only (403), status forced "Mới ghi nhận", `proposed: true`.
 */
export async function createReward(ctx: ServiceCtx, input: RewardCreateData): Promise<{ reward: Reward; created: boolean }> {
  const { user } = ctx;
  requireAnyPermission(user, ["reward.create", "reward.propose"]);
  requireLevel(user, input.levelId);
  const proposal = !hasPermission(user.profile, "reward.create");
  if (proposal && !isGvcnOfClass(user.profile, input.levelId, input.classCode)) throw Errors.forbidden(REWARD_MSG.proposeOwnClass);
  const status: RewardStatus = proposal ? PROPOSAL_STATUS : input.status;
  assertStatusChange(user, undefined, status);
  assertHttpUrls(input.evidenceUrls);
  const today = ctx.today ?? todayVN();
  const levelId = input.levelId;

  return runTx(async (tx) => {
    const previousId = await readIdempotency(tx, user.uid, input.clientRequestId, "reward");
    if (previousId) {
      const snap = await tx.get(rewardRef(previousId));
      if (snap.exists) return { reward: snap.data() as Reward, created: false };
    }
    const ref = await loadReference(levelId, tx);
    await assertEvidenceIds(tx, levelId, input.photoIds);
    const errors = validateRewardRules(input, ref, today);
    // The schema already enforces these; repeated for direct service callers (scripts).
    if (!isRewardPointLevel(input.points)) errors.push(REWARD_MSG.pointLevels);
    if (!isRewardReasonValid(input.reason)) errors.push(REWARD_MSG.reasonShort);
    const cls = findClass(ref, input.classCode);
    if (errors.length > 0 || !cls) throw Errors.validationList(errors);
    const alloc = await nextCode(tx, "KT", levelId, input.date, COL.rewards);
    const { week, month, semester } = weekInfo(input.date, ref.weeks, ref.config.semesters);
    const digest = await loadRewardDigests(tx, levelId, [week]);
    const photos = await planEvidenceLinks(tx, alloc.id, [], input.photoIds);

    const reward: Reward = omitEmpty(
      {
        id: alloc.id,
        code: alloc.code,
        levelId,
        date: input.date,
        week,
        month,
        semester,
        classCode: cls.code,
        grade: cls.grade,
        points: round2(input.points),
        reason: input.reason,
        reporter: input.reporter || actorName(user),
        evidenceUrls: input.evidenceUrls,
        photoIds: input.photoIds,
        note: input.note,
        status,
        ...(proposal ? { proposed: true } : {}),
        source: "app",
        createdBy: user.uid,
        createdByName: actorName(user),
        createdAt: nowIso(),
        rev: 1,
      },
      OPTIONAL_KEYS,
    );
    tx.create(rewardRef(reward.id), reward);
    digest.upsert(reward);
    digest.write(tx);
    writeEvidenceLinks(tx, reward.id, photos);
    commitCode(tx, alloc);
    writeIdempotency(tx, user.uid, input.clientRequestId, "reward", reward.id);
    bumpVersions(tx, [levelId]);
    writeAudit(tx, auditOf(user, "CREATE_REWARD", { entity: "reward", entityId: reward.id, levelId, ip: ctx.ip, detail: auditDetail(reward) }));
    return { reward, created: true };
  });
}

/** PATCH /api/rewards/:id — ADMIN any; EDITOR own within the window and never a verified reward. */
export async function updateReward(ctx: ServiceCtx, id: string, patch: RewardUpdateData): Promise<Reward> {
  const { user } = ctx;
  const today = ctx.today ?? todayVN();
  if (patch.evidenceUrls) assertHttpUrls(patch.evidenceUrls);
  return runTx(async (tx) => {
    const before = await readReward(tx, id);
    requireLevel(user, before.levelId);
    if (before.deletedAt) throw Errors.conflict(REWARD_MSG.deleted);
    assertCanEditRecord(user, before);
    if (before.status === VERIFIED_STATUS && !hasPermission(user.profile, "reward.verify")) throw Errors.forbidden(REWARD_MSG.verifiedLocked);
    if (patch.status) assertStatusChange(user, before.status, patch.status);
    assertBaseRev(before, patch.baseRev, REWARD_MSG.stale);

    const ref = await loadReference(before.levelId, tx);
    const addedPhotos = (patch.photoIds ?? before.photoIds).filter((p) => !before.photoIds.includes(p));
    await assertEvidenceIds(tx, before.levelId, addedPhotos);

    const date = patch.date ?? before.date;
    const classCode = patch.classCode ?? before.classCode;
    const points = patch.points ?? before.points;
    const reason = patch.reason ?? before.reason;
    const classChanged = classCode !== before.classCode;
    // An unchanged class that was later deactivated must not block editing other fields.
    const errors = validateRewardRules({ date, classCode, points }, ref, today, { checkCalendar: date !== before.date }).filter(
      (m) => classChanged || !m.startsWith(`Lớp ${classCode} đã ngừng`),
    );
    // REQ_V2 §5.3: the 1–5 scale and the reason length apply to CHANGED values only (legacy values stay valid).
    if (points !== before.points && !isRewardPointLevel(points)) errors.push(REWARD_MSG.pointLevels);
    if (reason !== before.reason && !isRewardReasonValid(reason)) errors.push(REWARD_MSG.reasonShort);
    const cls = findClass(ref, classCode) ?? (classChanged ? undefined : { code: before.classCode, grade: before.grade });
    if (errors.length > 0 || !cls) throw Errors.validationList(errors);

    const { week, month, semester } = weekInfo(date, ref.weeks, ref.config.semesters);
    const after: Reward = omitEmpty(
      {
        ...before,
        date,
        week,
        month,
        semester,
        classCode: cls.code,
        grade: cls.grade,
        points: round2(points),
        reason,
        reporter: patch.reporter ?? before.reporter,
        evidenceUrls: patch.evidenceUrls ?? before.evidenceUrls,
        photoIds: patch.photoIds ?? before.photoIds,
        note: patch.note ?? before.note,
        status: patch.status ?? before.status,
        updatedBy: user.email,
        updatedAt: nowIso(),
        rev: nextRev(before),
      },
      OPTIONAL_KEYS,
    );
    const changes = auditDiff(before, after, REWARD_AUDIT_FIELDS);
    if (Object.keys(changes).length === 0) return before;
    const digest = await loadRewardDigests(tx, before.levelId, [before.week, after.week]);
    const photos = await planEvidenceLinks(tx, id, before.photoIds, after.photoIds);

    tx.set(rewardRef(id), after);
    digest.upsert(after);
    digest.write(tx);
    writeEvidenceLinks(tx, id, photos);
    bumpVersions(tx, [before.levelId]);
    writeAudit(tx, auditOf(user, "UPDATE_REWARD", { entity: "reward", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { code: before.code, changes } }));
    return after;
  });
}

/** DELETE /api/rewards/:id — soft delete (record.delete). */
export async function softDeleteReward(ctx: ServiceCtx, id: string, reason: string): Promise<Reward> {
  const { user } = ctx;
  requirePermission(user, "record.delete");
  return runTx(async (tx) => {
    const before = await readReward(tx, id);
    requireLevel(user, before.levelId);
    if (before.deletedAt) throw Errors.conflict(REWARD_MSG.alreadyDeleted);
    const digest = await loadRewardDigests(tx, before.levelId, [before.week]);
    const after: Reward = { ...before, deletedAt: nowIso(), deletedBy: user.email, deleteReason: reason, rev: nextRev(before) };
    tx.set(rewardRef(id), after);
    digest.remove(id);
    digest.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(tx, auditOf(user, "DELETE_REWARD", { entity: "reward", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { ...auditDetail(before), reason } }));
    return after;
  });
}

/** POST /api/rewards/:id/restore (record.delete). */
export async function restoreReward(ctx: ServiceCtx, id: string): Promise<Reward> {
  const { user } = ctx;
  requirePermission(user, "record.delete");
  return runTx(async (tx) => {
    const before = await readReward(tx, id);
    requireLevel(user, before.levelId);
    if (!before.deletedAt) throw Errors.conflict(REWARD_MSG.notDeleted);
    assertRestorableWeek(before.week, (await loadReference(before.levelId, tx)).weeks);
    const digest = await loadRewardDigests(tx, before.levelId, [before.week]);
    const { deletedAt: _a, deletedBy: _b, deleteReason: _c, ...rest } = before;
    const after: Reward = { ...rest, updatedBy: user.email, updatedAt: nowIso(), rev: nextRev(before) };
    tx.set(rewardRef(id), after);
    digest.upsert(after);
    digest.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(
      tx,
      auditOf(user, "RESTORE_REWARD", { entity: "reward", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { ...auditDetail(before), deleteReason: before.deleteReason } }),
    );
    return after;
  });
}

/** Soft-deleted rewards of a level, most recently deleted first (index: levelId ASC, deletedAt DESC). */
export async function listDeletedRewards(levelId: LevelId, limit = 500): Promise<Reward[]> {
  const snap = await db()
    .collection(COL.rewards)
    .where("levelId", "==", levelId)
    .where("deletedAt", ">", "")
    .orderBy("deletedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as Reward);
}
