/**
 * importBatches/{id} lifecycle for batched (non-atomic) admin operations – workbook import, reset, restore.
 * The doc is written with `status: "running"` BEFORE any record is touched and set to "done" (or "failed") at the
 * end, so an operation that died half-way (Vercel maxDuration, network error) is detectable: the next import /
 * rebuild of the level repairs the digests and marks it "interrupted".
 */
import type { DocumentReference } from "firebase-admin/firestore";
import { COL } from "../../firestore-paths";
import type { LevelId } from "../../types";
import { db, nowIso } from "../firebase-admin";

export type BatchStatus = "running" | "done" | "failed" | "interrupted";

/** Older than this, a "running" batch is certainly dead (routes run at most 60 s). */
export const BATCH_STALE_MS = 5 * 60_000;

export interface UnfinishedBatch {
  ref: DocumentReference;
  createdAt: string;
}

/** Batches of the level still marked "running" (dead ones, or one running right now). */
export async function unfinishedBatches(levelId: LevelId): Promise<UnfinishedBatch[]> {
  const snap = await db().collection(COL.importBatches).where("levelId", "==", levelId).where("status", "==", "running").get();
  return snap.docs.map((d) => ({ ref: d.ref, createdAt: String(d.get("createdAt") ?? "") }));
}

/** After the digests were rebuilt: mark the dead ones (older than BATCH_STALE_MS) "interrupted". */
export async function settleUnfinishedBatches(batches: readonly UnfinishedBatch[], repairedBy: string, now: number = Date.now()): Promise<void> {
  const dead = batches.filter((b) => Date.parse(b.createdAt) < now - BATCH_STALE_MS);
  if (dead.length === 0) return;
  const batch = db().batch();
  const at = nowIso();
  for (const b of dead) batch.update(b.ref, { status: "interrupted", repairedAt: at, repairedBy });
  await batch.commit();
}

/** Final status of a batch (best effort for "failed": the original error is what matters). */
export async function finishBatch(ref: DocumentReference, status: Exclude<BatchStatus, "running" | "interrupted">, error?: unknown): Promise<void> {
  const data: Record<string, unknown> = { status, finishedAt: nowIso() };
  if (error !== undefined) data.error = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  try {
    await ref.update(data);
  } catch (e) {
    if (status !== "failed") throw e;
    console.error("[importBatches] cannot mark batch as failed", e);
  }
}
