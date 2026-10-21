/**
 * Rebuild digests from canonical documents (admin maintenance, imports, resets).
 * Not transactional: run while nobody is writing the level (writes that land during a rebuild may be
 * missing from the digest until the next mutation/rebuild). Every digest document is size-guarded and batches are
 * split by size as well as by count (Firestore rejects commits above 10 MiB).
 */
import type { DocumentReference, WriteBatch } from "firebase-admin/firestore";
import { COL } from "../firestore-paths";
import type { Incident, LevelId, Reward, Student, StudentLite } from "../types";
import { assertDigestSize, estimateBytes } from "./digest-size";
import {
  byClassThenName,
  byDateThenCode,
  incidentDigestRef,
  rewardBucketOf,
  rewardMonthDigestRef,
  studentDigestRef,
  toStudentLite,
  type ItemsDigestDoc,
} from "./digests";
import { db, nowIso } from "./firebase-admin";
import { rebuildReferenceDigest } from "./reference";
import { bumpVersions } from "./versions";
import { commitInChunks, sized, type SizedOp } from "./write";

export interface RebuildResult {
  weeks: number;
  incidents: number;
  rewards: number;
  students: number;
}

interface RebuildOpts {
  /** Increment meta/versions[level] at the end (default true). */
  bump?: boolean;
}

/** Existing digest doc ids of a level and kind (ids only, no payload). */
async function digestIds(levelId: LevelId, kind: "inc" | "rew"): Promise<Array<{ id: string; ref: DocumentReference }>> {
  const snap = await db().collection(COL.digests).where("levelId", "==", levelId).where("kind", "==", kind).select().get();
  return snap.docs.map((d) => ({ id: d.id, ref: d.ref }));
}

/** Group non-deleted records by a bucket key, write one digest per bucket and delete the stale ones. */
async function rebuildBuckets<T extends { id: string; date: string; code: string; deletedAt?: string }>(
  levelId: LevelId,
  kind: "inc" | "rew",
  records: T[],
  bucketOf: (r: T) => string | undefined,
  refOf: (bucket: string) => DocumentReference,
  docOf: (bucket: string, items: T[], updatedAt: string) => ItemsDigestDoc<T>,
  opts: RebuildOpts,
): Promise<{ buckets: number; count: number }> {
  const byBucket = new Map<string, T[]>();
  let count = 0;
  for (const r of records) {
    const bucket = r.deletedAt ? undefined : bucketOf(r);
    if (!bucket) continue;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), r]);
    count++;
  }
  const existing = await digestIds(levelId, kind);
  const ops: SizedOp[] = [];
  const keep = new Set<string>();
  const updatedAt = nowIso();
  for (const [bucket, items] of byBucket) {
    const ref = refOf(bucket);
    keep.add(ref.id);
    const doc = docOf(bucket, items.sort(byDateThenCode), updatedAt);
    assertDigestSize(ref.id, doc);
    ops.push(sized((b: WriteBatch) => void b.set(ref, doc), estimateBytes(doc)));
  }
  for (const d of existing) if (!keep.has(d.id)) ops.push((b) => void b.delete(d.ref));
  await commitInChunks(ops, opts.bump === false ? undefined : (b) => bumpVersions(b, [levelId]), 1);
  return { buckets: byBucket.size, count };
}

/** Group non-deleted incidents by week, rewrite every week digest and delete stale week digests. */
export async function rebuildIncidentDigests(levelId: LevelId, opts: RebuildOpts = {}): Promise<Pick<RebuildResult, "weeks" | "incidents">> {
  const snap = await db().collection(COL.incidents).where("levelId", "==", levelId).get();
  const records = snap.docs.map((d) => d.data() as Incident);
  const r = await rebuildBuckets(
    levelId,
    "inc",
    records,
    (i) => (typeof i.week === "string" && i.week ? i.week : undefined),
    (week) => incidentDigestRef(levelId, week),
    (week, items, updatedAt) => ({ levelId, kind: "inc", week, items, updatedAt }),
    opts,
  );
  return { weeks: r.buckets, incidents: r.count };
}

/**
 * Rewrite the monthly reward digests `__rew__{yyyy-mm}` from non-deleted canonical rewards and delete stale ones –
 * including the legacy single `__rew` document (this is the migration to the monthly layout).
 */
export async function rebuildRewardDigest(levelId: LevelId, opts: RebuildOpts = {}): Promise<Pick<RebuildResult, "rewards">> {
  const snap = await db().collection(COL.rewards).where("levelId", "==", levelId).get();
  const records = snap.docs.map((d) => d.data() as Reward);
  const r = await rebuildBuckets(
    levelId,
    "rew",
    records,
    (x) => (typeof x.week === "string" && x.week ? rewardBucketOf(x.week) : undefined),
    (month) => rewardMonthDigestRef(levelId, month),
    (month, items, updatedAt) => ({ levelId, kind: "rew", month, items, updatedAt }),
    opts,
  );
  return { rewards: r.count };
}

/** StudentLite list of `__stu` (all statuses: the admin roster screen lists former students too) from canonical docs. */
export function studentDigestItems(students: Iterable<Student>): StudentLite[] {
  return [...students].map(toStudentLite).sort(byClassThenName);
}

/** Rewrite digests/{level}__stu from students/ (levelId == level, all statuses). */
export async function rebuildStudentDigest(levelId: LevelId, opts: RebuildOpts = {}): Promise<Pick<RebuildResult, "students">> {
  const snap = await db().collection(COL.students).where("levelId", "==", levelId).get();
  const items = studentDigestItems(snap.docs.map((d) => d.data() as Student));
  const digestRef = studentDigestRef(levelId);
  const doc: ItemsDigestDoc<StudentLite> = { levelId, kind: "stu", items, updatedAt: nowIso() };
  assertDigestSize(digestRef.id, doc);
  const batch = db().batch();
  batch.set(digestRef, doc);
  if (opts.bump !== false) bumpVersions(batch, [levelId]);
  await batch.commit();
  return { students: items.length };
}

/**
 * Rebuild `__ref`, `__stu`, the reward and every `__inc__{week}` digest of a level; bumps the version once.
 * The three record digests are rebuilt independently: one failing (e.g. an oversized document) does not stop the
 * others; the first error is rethrown after all of them ran.
 */
export async function rebuildAllDigests(levelId: LevelId): Promise<RebuildResult> {
  await rebuildReferenceDigest(levelId, { bump: false });
  const [inc, rew, stu] = await Promise.allSettled([
    rebuildIncidentDigests(levelId, { bump: false }),
    rebuildRewardDigest(levelId, { bump: false }),
    rebuildStudentDigest(levelId, { bump: false }),
  ]);
  const batch = db().batch();
  bumpVersions(batch, [levelId]);
  await batch.commit();
  for (const r of [inc, rew, stu]) if (r.status === "rejected") throw r.reason;
  const value = <T>(r: PromiseSettledResult<T>) => (r as PromiseFulfilledResult<T>).value;
  return { ...value(inc), ...value(rew), ...value(stu) };
}
