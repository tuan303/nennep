/**
 * LevelDataset = `__ref` + `__stu` + `__inc__{week}` for every calendar week + the reward digests of the calendar
 * months (one getAll), then filtered per viewer (GVCN redaction, ARCHITECTURE §2).
 * Only records of the calendar weeks are included – incidents AND rewards – so records of another school year never
 * count in this year's rankings (the canonical docs keep them).
 * The unredacted dataset is memoised per (project, level, version) for DATASET_CACHE_TTL_MS: every write bumps
 * the version, so a cached dataset is exactly the digests of that version, and all tabs refetching after a write
 * cost Firestore reads once per server instance instead of once per tab. Concurrent builds share one promise.
 * Callers must treat the returned dataset as read-only.
 */
import { canSeeClassDetail } from "../constants";
import { COL } from "../firestore-paths";
import type { DataIssue, Incident, LevelDataset, LevelId, Reward, Student, StudentLite, UserProfile } from "../types";
import { calendarWeekSet } from "./calendar";
import {
  byDateThenCode,
  incidentDigestRef,
  rewardBucketOf,
  rewardDigestRef,
  rewardMonthDigestRef,
  studentDigestRef,
} from "./digests";
import { studentDigestItems } from "./digests-rebuild";
import { currentProjectId, db, nowIso } from "./firebase-admin";
import { loadReference } from "./reference";
import { readVersion } from "./versions";

export const DATASET_CACHE_TTL_MS = 60_000;

const cache = new Map<string, { version: number; expires: number; promise: Promise<LevelDataset> }>();

/** Drop the memoised datasets (all levels, or one). Tests / maintenance that write without a version bump. */
export function invalidateDatasetCache(levelId?: LevelId): void {
  if (!levelId) cache.clear();
  else for (const key of [...cache.keys()]) if (key.endsWith(`|${levelId}`)) cache.delete(key);
}

function itemsOf<T>(data: unknown): T[] | undefined {
  const items = (data as { items?: unknown } | undefined)?.items;
  return Array.isArray(items) ? (items as T[]) : undefined;
}

async function loadLevelDataset(levelId: LevelId, version: number): Promise<LevelDataset> {
  const ref = await loadReference(levelId);
  const weekSet = calendarWeekSet(ref.weeks);
  const months = [...new Set(ref.weeks.map((w) => rewardBucketOf(w.weekStart)))];
  const weekRefs = ref.weeks.map((w) => incidentDigestRef(levelId, w.weekStart));
  const monthRefs = months.map((m) => rewardMonthDigestRef(levelId, m));
  const [stuSnap, legacyRewSnap, ...rest] = await db().getAll(studentDigestRef(levelId), rewardDigestRef(levelId), ...weekRefs, ...monthRefs);
  const weekSnaps = rest.slice(0, weekRefs.length);
  const monthSnaps = rest.slice(weekRefs.length);

  let students = itemsOf<StudentLite>(stuSnap.data());
  if (!students) {
    // Digest never built: fall back to canonical docs (read-only; admins can rebuild digests).
    const snap = await db().collection(COL.students).where("levelId", "==", levelId).get();
    students = studentDigestItems(snap.docs.map((d) => d.data() as Student));
  }

  let rewards: Reward[];
  const legacy = itemsOf<Reward>(legacyRewSnap.data());
  if (legacy) rewards = legacy;
  else if (monthSnaps.some((s) => s.exists)) rewards = monthSnaps.flatMap((s) => itemsOf<Reward>(s.data()) ?? []);
  else {
    // No reward digest yet (new level or never rebuilt): canonical query (1 read when there are none).
    const snap = await db().collection(COL.rewards).where("levelId", "==", levelId).get();
    rewards = snap.docs.map((d) => d.data() as Reward).filter((r) => !r.deletedAt);
  }
  rewards = rewards.filter((r) => weekSet.has(r.week)).sort(byDateThenCode);

  const incidents: Incident[] = [];
  for (const s of weekSnaps) incidents.push(...(itemsOf<Incident>(s.data()) ?? []));
  incidents.sort(byDateThenCode);

  return {
    levelId,
    version,
    generatedAt: nowIso(),
    config: ref.config,
    classes: ref.classes,
    catalog: ref.catalog,
    weeks: ref.weeks,
    students,
    incidents,
    rewards,
    redacted: false,
  };
}

/** The full (unredacted, read-only) dataset of a level. Pass `version` when already read (ETag check). */
export async function buildLevelDataset(levelId: LevelId, version?: number): Promise<LevelDataset> {
  const v = version ?? (await readVersion(levelId));
  const key = `${currentProjectId()}|${levelId}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.version === v && hit.expires > now) return hit.promise;
  const promise = loadLevelDataset(levelId, v);
  cache.set(key, { version: v, expires: now + DATASET_CACHE_TTL_MS, promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

const NAME_ISSUES: ReadonlySet<DataIssue["code"]> = new Set(["STUDENT_WRONG_CLASS", "STUDENT_NOT_FOUND", "DUPLICATE_STUDENT", "LEGACY_NOTE", "OTHER"]);

/** Incident of a class the viewer may not see in detail: keep class/error/points/date, drop personal data. */
export function redactIncident(i: Incident): Incident {
  const {
    detail: _detail,
    gvcnNote: _note,
    gvcnNoteBy: _noteBy,
    gvcnNoteAt: _noteAt,
    reporter: _reporter,
    ...rest
  } = i;
  return {
    ...rest,
    students: [],
    evidenceUrls: [],
    photoIds: [],
    dataIssues: i.dataIssues.map((d) => (NAME_ISSUES.has(d.code) ? { code: d.code, message: "Chi tiết đã được ẩn." } : d)),
  };
}

/** Reward of another class: drop notes/evidence/reporter (class-level aggregate stays). */
export function redactReward(r: Reward): Reward {
  const { note: _note, reporter: _reporter, ...rest } = r;
  return { ...rest, evidenceUrls: [], photoIds: [] };
}

/** Ids of students named in incidents of classes the viewer may see in detail. */
export function referencedStudentIds(incidents: readonly Incident[], visible: (classCode: string) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const i of incidents) if (visible(i.classCode)) for (const s of i.students) ids.add(s.id);
  return ids;
}

/**
 * Filter a dataset for the viewer: users without `view.allClassesDetail` (GVCN) receive only the students of their
 * own classes – those currently studying there, plus those named in this school year's incidents of those classes
 * (a class code is reused every year: last year's graduates of "5A1" are not the new GVCN's students) – and other
 * classes' incidents/rewards are redacted (`redacted: true`).
 */
export function redactForGvcn(ds: LevelDataset, profile: UserProfile): LevelDataset {
  const fullAccess = ds.classes.every((c) => canSeeClassDetail(profile, ds.levelId, c.code)) && profile.role !== "GVCN";
  if (fullAccess) return { ...ds, redacted: false };
  const visible = (classCode: string) => canSeeClassDetail(profile, ds.levelId, classCode);
  const referenced = referencedStudentIds(ds.incidents, visible);
  return {
    ...ds,
    students: ds.students.filter((s) => visible(s.classCode) && (s.status === "ACTIVE" || referenced.has(s.id))),
    incidents: ds.incidents.map((i) => (visible(i.classCode) ? i : redactIncident(i))),
    rewards: ds.rewards.map((r) => (visible(r.classCode) ? r : redactReward(r))),
    redacted: true,
  };
}

/** Weak ETag of a dataset version: W/"<version>". */
export function datasetEtag(version: number): string {
  return `W/"${version}"`;
}

/** True when If-None-Match contains this version (accepts W/"5", "5", 5, lists and *). */
export function etagMatches(ifNoneMatch: string | null | undefined, version: number): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((t) => t.trim().replace(/^W\//i, "").replace(/^"(.*)"$/, "$1"))
    .some((t) => t === "*" || t === String(version));
}
