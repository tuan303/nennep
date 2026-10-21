/**
 * Bảo trì → Ảnh minh chứng: statistics of the evidence photos of a level and deletion of photos that were uploaded
 * but never attached to an incident/reward (abandoned forms). Photos of minors are kept only as long as a record
 * needs them; storage on the free plan is limited (1 GiB for the whole database).
 * Records mark their photos (`evidence.attachedTo`) when they are saved. Photos uploaded before that existed (or
 * marked wrongly) are checked against the records (`photoIds` array-contains) before anything is deleted, and marked
 * when a record still uses them. Soft-deleted records keep their photos (they can be restored).
 */
import type { DocumentReference, WriteBatch } from "firebase-admin/firestore";
import type { z } from "zod";
import type { EvidenceMaintenanceResult, EvidenceMaintenanceSchema } from "../../contract";
import { COL } from "../../firestore-paths";
import { auditOf, writeAudit } from "../audit";
import { requireLevel } from "../auth";
import { db, nowIso } from "../firebase-admin";
import type { ServiceCtx } from "../records";
import { commitInChunks } from "../write";
import { mapLimit } from "./common";

export type EvidenceMaintenanceData = z.output<typeof EvidenceMaintenanceSchema>;

/** Unattached photos younger than this are kept (the form that uploaded them may still be open). */
export const EVIDENCE_GRACE_MS = 48 * 3_600_000;

interface Candidate {
  ref: DocumentReference;
  size: number;
}

/** Id of a record (incident first, then reward) whose `photoIds` contains `id`. */
async function referencingRecord(id: string): Promise<string | undefined> {
  for (const collection of [COL.incidents, COL.rewards]) {
    const snap = await db().collection(collection).where("photoIds", "array-contains", id).limit(1).select().get();
    if (!snap.empty) return snap.docs[0].id;
  }
  return undefined;
}

/** POST /api/admin/evidence — `dryRun` (default): statistics only; otherwise also delete the orphaned photos. */
export async function maintainEvidence(ctx: ServiceCtx, input: EvidenceMaintenanceData, now: number = Date.now()): Promise<EvidenceMaintenanceResult> {
  requireLevel(ctx.user, input.levelId);
  // Metadata only: the image bytes are never downloaded.
  const snap = await db().collection(COL.evidence).where("levelId", "==", input.levelId).select("createdAt", "attachedTo", "size").get();
  let totalBytes = 0;
  let attached = 0;
  const candidates: Candidate[] = [];
  for (const d of snap.docs) {
    const size = Number(d.get("size")) || 0;
    totalBytes += size;
    if (d.get("attachedTo")) attached++;
    // A recent unattached upload is neither attached nor orphaned yet (its form may still be open).
    else if (Date.parse(String(d.get("createdAt") ?? "")) < now - EVIDENCE_GRACE_MS) candidates.push({ ref: d.ref, size });
  }
  const checked = await mapLimit(candidates, 10, async (c) => ({ c, recordId: await referencingRecord(c.ref.id) }));
  const backfill = checked.filter((x) => x.recordId);
  const orphans = checked.filter((x) => !x.recordId).map((x) => x.c);
  const orphanedBytes = orphans.reduce((n, o) => n + o.size, 0);
  const result: EvidenceMaintenanceResult = {
    levelId: input.levelId,
    dryRun: input.dryRun,
    total: snap.size,
    totalBytes,
    attached: attached + backfill.length,
    orphaned: orphans.length,
    orphanedBytes,
    deleted: 0,
  };
  if (input.dryRun || (orphans.length === 0 && backfill.length === 0)) return result;

  const at = nowIso();
  const ops: Array<(b: WriteBatch) => void> = [
    ...backfill.map((x) => (b: WriteBatch) => void b.update(x.c.ref, { attachedTo: x.recordId, attachedAt: at })),
    ...orphans.map((o) => (b: WriteBatch) => void b.delete(o.ref)),
  ];
  await commitInChunks(
    ops,
    (b) =>
      writeAudit(
        b,
        auditOf(ctx.user, "RESET_DATA", {
          entity: "evidence",
          entityId: input.levelId,
          levelId: input.levelId,
          ip: ctx.ip,
          detail: { purgeEvidence: true, deleted: orphans.length, deletedBytes: orphanedBytes, relinked: backfill.length, deletedIds: orphans.slice(0, 200).map((o) => o.ref.id) },
        }),
      ),
    1,
  );
  return { ...result, deleted: orphans.length };
}
