/**
 * meta/versions: one counter per level, incremented by EVERY write that changes a level's dataset.
 * Browsers listen to this doc (onSnapshot) and refetch /api/dataset when their level's number changes.
 */
import type { DocumentReference } from "firebase-admin/firestore";
import { LEVEL_IDS } from "../constants";
import { COL, META_VERSIONS_DOC } from "../firestore-paths";
import type { LevelId } from "../types";
import { FieldValue, db, nowIso } from "./firebase-admin";
import { readDoc, setDoc, type Reader, type WriteTarget } from "./write";

export function versionsRef(): DocumentReference {
  return db().collection(COL.meta).doc(META_VERSIONS_DOC);
}

/** Increment the counters of `levelIds` (deduplicated) + updatedAt, inside the caller's tx/batch. */
export function bumpVersions(target: WriteTarget, levelIds: readonly LevelId[]): void {
  const unique = [...new Set(levelIds)];
  if (unique.length === 0) return;
  const data: Record<string, unknown> = { updatedAt: nowIso() };
  for (const l of unique) data[l] = FieldValue.increment(1);
  setDoc(target, versionsRef(), data, true);
}

/** Current counters (0 for levels never written). */
export async function readVersions(reader?: Reader): Promise<Record<LevelId, number>> {
  const snap = await readDoc(reader, versionsRef());
  const data = (snap.data() ?? {}) as Partial<Record<string, unknown>>;
  const out = {} as Record<LevelId, number>;
  for (const l of LEVEL_IDS) {
    const v = data[l];
    out[l] = typeof v === "number" ? v : 0;
  }
  return out;
}

export async function readVersion(levelId: LevelId, reader?: Reader): Promise<number> {
  return (await readVersions(reader))[levelId];
}
