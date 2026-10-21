/**
 * Bảo trì: rebuild digests, reset a level (soft-delete every live incident/reward with deleteReason
 * "RESET:<batchId>") and undo such a reset. Bulk writes go in ≤450-op batches, then digests are rebuilt.
 * Run while the level is quiet (rebuilds are not transactional). See batches.ts for crash safety.
 */
import { FieldValue, type DocumentReference, type WriteBatch } from "firebase-admin/firestore";
import type { z } from "zod";
import type { ResetLevelSchema, RestoreResetSchema } from "../../contract";
import { COL } from "../../firestore-paths";
import type { LevelId } from "../../types";
import { auditOf, writeAudit, writeAuditDirect } from "../audit";
import { accessibleLevels, requireLevel } from "../auth";
import { rebuildAllDigests, type RebuildResult } from "../digests";
import { Errors } from "../errors";
import { db, nowIso } from "../firebase-admin";
import type { ServiceCtx } from "../records";
import { commitInChunks } from "../write";
import { finishBatch, settleUnfinishedBatches, unfinishedBatches } from "./batches";

export type ResetLevelData = z.output<typeof ResetLevelSchema>;
export type RestoreResetData = z.output<typeof RestoreResetSchema>;

export const RESET_PREFIX = "RESET:";
export const MAINT_MSG = {
  confirm: (levelId: LevelId) => `Nhập chính xác "XOA ${levelId}" để xác nhận xóa dữ liệu.`,
  batchNotFound: "Không tìm thấy đợt xóa dữ liệu này.",
  alreadyRestored: "Đợt xóa dữ liệu này đã được khôi phục trước đó.",
} as const;

/** POST /api/admin/rebuild-digests — one level, or every level the admin can access. Also repairs interrupted imports. */
export async function rebuildDigests(ctx: ServiceCtx, levelId?: LevelId): Promise<Partial<Record<LevelId, RebuildResult>>> {
  const levels = levelId ? [levelId] : accessibleLevels(ctx.user.profile);
  const out: Partial<Record<LevelId, RebuildResult>> = {};
  for (const l of levels) {
    requireLevel(ctx.user, l);
    const unfinished = await unfinishedBatches(l);
    out[l] = await rebuildAllDigests(l);
    await settleUnfinishedBatches(unfinished, "rebuild-digests");
    await writeAuditDirect(auditOf(ctx.user, "REBUILD_DIGESTS", { entity: "digests", entityId: l, levelId: l, ip: ctx.ip, detail: { ...out[l] } }));
  }
  return out;
}

async function liveRecordRefs(collection: string, levelId: LevelId): Promise<DocumentReference[]> {
  const snap = await db().collection(collection).where("levelId", "==", levelId).get();
  return snap.docs.filter((d) => !d.get("deletedAt")).map((d) => d.ref);
}

/**
 * POST /api/admin/reset-level — soft-deletes all live incidents & rewards of a level (restorable as a batch).
 * The batch doc ("running") and the RESET_DATA audit are written first, so a reset that dies half-way can still be
 * undone with restore-reset (which finds the records by `deleteReason`).
 */
export async function resetLevel(ctx: ServiceCtx, input: ResetLevelData): Promise<{ batchId: string; incidents: number; rewards: number }> {
  const { user } = ctx;
  requireLevel(user, input.levelId);
  if (input.confirmText.trim() !== `XOA ${input.levelId}`) throw Errors.validation(MAINT_MSG.confirm(input.levelId));
  const batchRef = db().collection(COL.importBatches).doc();
  const [incidents, rewards] = await Promise.all([liveRecordRefs(COL.incidents, input.levelId), liveRecordRefs(COL.rewards, input.levelId)]);
  const now = nowIso();
  const counts = { incidents: incidents.length, rewards: rewards.length };
  const start = db().batch();
  start.set(batchRef, { id: batchRef.id, kind: "reset", status: "running", levelId: input.levelId, ...counts, createdAt: now, createdBy: user.email });
  writeAudit(start, auditOf(user, "RESET_DATA", { entity: "importBatch", entityId: batchRef.id, levelId: input.levelId, ip: ctx.ip, detail: { batchId: batchRef.id, ...counts } }));
  await start.commit();
  try {
    const patch = { deletedAt: now, deletedBy: user.email, deleteReason: `${RESET_PREFIX}${batchRef.id}`, rev: FieldValue.increment(1) };
    await commitInChunks([...incidents, ...rewards].map((ref) => (b: WriteBatch) => b.update(ref, patch)));
    await rebuildAllDigests(input.levelId);
    await finishBatch(batchRef, "done");
  } catch (e) {
    await finishBatch(batchRef, "failed", e);
    throw e;
  }
  return { batchId: batchRef.id, ...counts };
}

/** POST /api/admin/restore-reset — restores exactly the records soft-deleted by that reset batch (also a partial one). */
export async function restoreReset(ctx: ServiceCtx, input: RestoreResetData): Promise<{ incidents: number; rewards: number }> {
  const { user } = ctx;
  requireLevel(user, input.levelId);
  const batchRef = db().collection(COL.importBatches).doc(input.batchId);
  const batchSnap = await batchRef.get();
  const meta = batchSnap.data() as { kind?: string; levelId?: string; restoredAt?: string } | undefined;
  if (!meta || meta.kind !== "reset" || meta.levelId !== input.levelId) throw Errors.notFound(MAINT_MSG.batchNotFound);
  if (meta.restoredAt) throw Errors.conflict(MAINT_MSG.alreadyRestored);

  const reason = `${RESET_PREFIX}${input.batchId}`;
  const byReason = (collection: string) =>
    db().collection(collection).where("levelId", "==", input.levelId).where("deleteReason", "==", reason).get();
  const [incSnap, rewSnap] = await Promise.all([byReason(COL.incidents), byReason(COL.rewards)]);
  const now = nowIso();
  const patch = {
    deletedAt: FieldValue.delete(),
    deletedBy: FieldValue.delete(),
    deleteReason: FieldValue.delete(),
    updatedAt: now,
    updatedBy: user.email,
    rev: FieldValue.increment(1),
  };
  const ops = [...incSnap.docs, ...rewSnap.docs].map((d) => (b: WriteBatch) => b.update(d.ref, patch));
  const counts = { incidents: incSnap.size, rewards: rewSnap.size };
  await commitInChunks(ops);
  await rebuildAllDigests(input.levelId);
  // Last: once marked restored, a second restore is refused – a restore that died before this point can be re-run.
  const end = db().batch();
  end.update(batchRef, { restoredAt: now, restoredBy: user.email });
  writeAudit(end, auditOf(user, "RESET_DATA", { entity: "importBatch", entityId: input.batchId, levelId: input.levelId, ip: ctx.ip, detail: { restore: true, batchId: input.batchId, ...counts } }));
  await end.commit();
  return counts;
}
