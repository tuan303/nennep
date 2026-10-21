/**
 * Read-model digests, updated INSIDE the same transaction as the canonical write:
 *   digests/{level}__inc__{week}    Incident[] (non-deleted) of one week
 *   digests/{level}__rew__{yyyy-mm} Reward[]   (non-deleted) whose week (Monday) is in that month
 *   digests/{level}__ins__{yyyy-mm} Inspection[] (non-deleted) whose week (Monday) is in that month
 *   digests/{level}__stu            StudentLite[]
 * Every digest document is bounded by the activity of one week / month, so none grows across school years, and the
 * dataset only reads the documents of the calendar weeks (records of other school years stay canonical).
 * Legacy: `digests/{level}__rew` (one document with every reward of every year). While it exists, reward writes keep
 * maintaining it (so nothing is lost before the migration) and the dataset reads it; the next digest rebuild
 * (Bảo trì, import, reset) writes the monthly documents and deletes it.
 * Usage in a transaction (reads before writes!):
 *   const inc = await loadIncidentDigests(tx, levelId, [before?.week, after.week]);   // read phase
 *   inc.upsert(after); inc.write(tx);                                                  // write phase
 * Rebuild functions (from canonical docs) live in ./digests-rebuild.ts and are re-exported here.
 */
import type { DocumentReference } from "firebase-admin/firestore";
import { COL, digestIncidentsWeekId, digestInspectionsMonthId, digestRewardsId, digestRewardsMonthId, digestStudentsId } from "../firestore-paths";
import type { Incident, Inspection, LevelId, Reward, Student, StudentLite } from "../types";
import { assertDigestSize } from "./digest-size";
import { db, nowIso } from "./firebase-admin";
import { readDocs, readDoc, setDoc, type Reader, type WriteTarget } from "./write";

export type DigestKind = "inc" | "rew" | "stu" | "ins";

export interface ItemsDigestDoc<T> {
  levelId: LevelId;
  kind: DigestKind;
  week?: string; // "inc" only
  month?: string; // monthly "rew" / "ins" only
  items: T[];
  updatedAt: string;
}

const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export const byDateThenCode = (a: { date: string; code: string }, b: { date: string; code: string }): number =>
  a.date.localeCompare(b.date) || a.code.localeCompare(b.code);

export const byClassThenName = (a: StudentLite, b: StudentLite): number =>
  collator.compare(a.classCode, b.classCode) || collator.compare(a.name, b.name) || a.id.localeCompare(b.id);

export function incidentDigestRef(levelId: LevelId, week: string): DocumentReference {
  return db().collection(COL.digests).doc(digestIncidentsWeekId(levelId, week));
}
/** Legacy single reward digest (see the module comment). */
export function rewardDigestRef(levelId: LevelId): DocumentReference {
  return db().collection(COL.digests).doc(digestRewardsId(levelId));
}
/** Monthly reward digest of `month` ("yyyy-mm"). */
export function rewardMonthDigestRef(levelId: LevelId, month: string): DocumentReference {
  return db().collection(COL.digests).doc(digestRewardsMonthId(levelId, month));
}
/** Monthly inspection digest of `month` ("yyyy-mm" of the inspection's week). */
export function inspectionMonthDigestRef(levelId: LevelId, month: string): DocumentReference {
  return db().collection(COL.digests).doc(digestInspectionsMonthId(levelId, month));
}
export function studentDigestRef(levelId: LevelId): DocumentReference {
  return db().collection(COL.digests).doc(digestStudentsId(levelId));
}

/** Monthly reward digest bucket of a week (Monday "yyyy-mm-dd") → "yyyy-mm". */
export function rewardBucketOf(week: string): string {
  return week.slice(0, 7);
}

export function toStudentLite(s: Pick<Student, "id" | "name" | "dob" | "classCode" | "grade" | "status">): StudentLite {
  const lite: StudentLite = { id: s.id, name: s.name, classCode: s.classCode, grade: s.grade, status: s.status };
  if (s.dob) lite.dob = s.dob;
  return lite;
}

/** In-memory editable copy of one digest document. */
export class DigestDraft<T extends { id: string }> {
  private list: T[];
  private changed = false;

  constructor(
    readonly ref: DocumentReference,
    private readonly base: Omit<ItemsDigestDoc<T>, "items" | "updatedAt">,
    items: T[],
    private readonly compare: (a: T, b: T) => number,
    readonly existed: boolean,
  ) {
    this.list = [...items];
  }

  get items(): readonly T[] {
    return this.list;
  }
  get dirty(): boolean {
    return this.changed;
  }
  has(id: string): boolean {
    return this.list.some((x) => x.id === id);
  }
  get(id: string): T | undefined {
    return this.list.find((x) => x.id === id);
  }

  /** Insert or replace by id, keeping the sort order. */
  upsert(item: T): void {
    this.list = this.list.filter((x) => x.id !== item.id);
    this.list.push(item);
    this.list.sort(this.compare);
    this.changed = true;
  }

  /** Remove by id; returns whether it was present. */
  remove(id: string): boolean {
    const before = this.list.length;
    this.list = this.list.filter((x) => x.id !== id);
    const removed = this.list.length !== before;
    if (removed) this.changed = true;
    return removed;
  }

  /** Replace every item (used by rebuilds). */
  replaceAll(items: T[]): void {
    this.list = [...items].sort(this.compare);
    this.changed = true;
  }

  /** Write when dirty (or always with force). Throws before writing if the doc would exceed ~900 KB. */
  write(target: WriteTarget, force = false): void {
    if (!this.changed && !force) return;
    const doc: ItemsDigestDoc<T> = { ...this.base, items: this.list, updatedAt: nowIso() };
    assertDigestSize(this.ref.id, doc);
    setDoc(target, this.ref, doc as unknown as Record<string, unknown>);
    this.changed = false;
  }
}

function itemsOf<T>(data: unknown): T[] {
  const items = (data as { items?: unknown } | undefined)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

/**
 * Digest documents of one level keyed by a bucket (incidents: week; rewards: month of the week). `upsert` puts the
 * item in its bucket and removes it from the other loaded buckets (moves need both buckets loaded).
 */
export class BucketDigestSet<T extends { id: string }> {
  constructor(
    readonly levelId: LevelId,
    readonly drafts: Map<string, DigestDraft<T>>,
    private readonly bucketOf: (item: T) => string,
  ) {}

  private draftFor(bucket: string): DigestDraft<T> {
    const d = this.drafts.get(bucket);
    if (!d) throw new Error(`Digest bucket ${bucket} of ${this.levelId} was not loaded`);
    return d;
  }

  upsert(item: T): void {
    const bucket = this.bucketOf(item);
    for (const [key, d] of this.drafts) if (key !== bucket) d.remove(item.id);
    this.draftFor(bucket).upsert(item);
  }

  /** Remove from every loaded bucket. */
  remove(id: string): void {
    for (const d of this.drafts.values()) d.remove(id);
  }

  /** Every item of the loaded buckets. */
  items(): T[] {
    return [...this.drafts.values()].flatMap((d) => [...d.items]);
  }

  write(target: WriteTarget): void {
    for (const d of this.drafts.values()) d.write(target);
  }
}

/* --------------------------------- incidents -------------------------------- */

/** Week digests of one level, keyed by week (Monday). */
export class IncidentDigestSet extends BucketDigestSet<Incident> {
  constructor(levelId: LevelId, drafts: Map<string, DigestDraft<Incident>>) {
    super(levelId, drafts, (i) => i.week);
  }
}

/** READ phase: load the week digests for the given weeks (undefined/duplicates ignored). */
export async function loadIncidentDigests(
  reader: Reader,
  levelId: LevelId,
  weeks: ReadonlyArray<string | undefined>,
): Promise<IncidentDigestSet> {
  const unique = [...new Set(weeks.filter((w): w is string => Boolean(w)))];
  const refs = unique.map((w) => incidentDigestRef(levelId, w));
  const snaps = await readDocs(reader, refs);
  const drafts = new Map<string, DigestDraft<Incident>>();
  unique.forEach((week, i) => {
    const snap = snaps[i];
    drafts.set(
      week,
      new DigestDraft<Incident>(refs[i], { levelId, kind: "inc", week }, itemsOf<Incident>(snap.data()), byDateThenCode, snap.exists),
    );
  });
  return new IncidentDigestSet(levelId, drafts);
}

/* ---------------------------------- rewards --------------------------------- */

/**
 * Reward digests touched by a mutation: the monthly documents of the given weeks, or – while the legacy single
 * `__rew` document still exists – that document only (it holds every reward until the next rebuild).
 */
export class RewardDigestSet {
  constructor(
    readonly levelId: LevelId,
    readonly months: BucketDigestSet<Reward>,
    readonly legacy: DigestDraft<Reward> | undefined,
  ) {}

  upsert(r: Reward): void {
    if (this.legacy) this.legacy.upsert(r);
    else this.months.upsert(r);
  }

  remove(id: string): void {
    if (this.legacy) this.legacy.remove(id);
    else this.months.remove(id);
  }

  /** Rewards of the loaded documents (legacy: every reward of the level). */
  items(): Reward[] {
    return this.legacy ? [...this.legacy.items] : this.months.items();
  }

  write(target: WriteTarget): void {
    if (this.legacy) this.legacy.write(target);
    else this.months.write(target);
  }
}

/** READ phase: the reward digests of the given weeks (+ the legacy `__rew` document, 1 extra read). */
export async function loadRewardDigests(reader: Reader, levelId: LevelId, weeks: ReadonlyArray<string | undefined>): Promise<RewardDigestSet> {
  const months = [...new Set(weeks.filter((w): w is string => Boolean(w)).map(rewardBucketOf))];
  const legacyRef = rewardDigestRef(levelId);
  const refs = months.map((m) => rewardMonthDigestRef(levelId, m));
  const [legacySnap, ...snaps] = await readDocs(reader, [legacyRef, ...refs]);
  const drafts = new Map<string, DigestDraft<Reward>>();
  months.forEach((month, i) => {
    const snap = snaps[i];
    drafts.set(month, new DigestDraft<Reward>(refs[i], { levelId, kind: "rew", month }, itemsOf<Reward>(snap.data()), byDateThenCode, snap.exists));
  });
  const legacy = legacySnap.exists
    ? new DigestDraft<Reward>(legacyRef, { levelId, kind: "rew" }, itemsOf<Reward>(legacySnap.data()), byDateThenCode, true)
    : undefined;
  return new RewardDigestSet(levelId, new BucketDigestSet<Reward>(levelId, drafts, (r) => rewardBucketOf(r.week)), legacy);
}

/* -------------------------------- inspections ------------------------------- */

/** Monthly inspection digests of one level, keyed by "yyyy-mm" of the inspection's week (same buckets as rewards). */
export class InspectionDigestSet extends BucketDigestSet<Inspection> {
  constructor(levelId: LevelId, drafts: Map<string, DigestDraft<Inspection>>) {
    super(levelId, drafts, (x) => rewardBucketOf(x.week));
  }
}

/** READ phase: the monthly inspection digests of the given weeks (load before AND after weeks when re-dating). */
export async function loadInspectionDigests(reader: Reader, levelId: LevelId, weeks: ReadonlyArray<string | undefined>): Promise<InspectionDigestSet> {
  const months = [...new Set(weeks.filter((w): w is string => Boolean(w)).map(rewardBucketOf))];
  const refs = months.map((m) => inspectionMonthDigestRef(levelId, m));
  const snaps = await readDocs(reader, refs);
  const drafts = new Map<string, DigestDraft<Inspection>>();
  months.forEach((month, i) => {
    const snap = snaps[i];
    drafts.set(month, new DigestDraft<Inspection>(refs[i], { levelId, kind: "ins", month }, itemsOf<Inspection>(snap.data()), byDateThenCode, snap.exists));
  });
  return new InspectionDigestSet(levelId, drafts);
}

/* ---------------------------------- students -------------------------------- */

/** READ phase: the students digest of a level (StudentLite). */
export async function loadStudentDigest(reader: Reader, levelId: LevelId): Promise<DigestDraft<StudentLite>> {
  const ref = studentDigestRef(levelId);
  const snap = await readDoc(reader, ref);
  return new DigestDraft<StudentLite>(ref, { levelId, kind: "stu" }, itemsOf<StudentLite>(snap.data()), byClassThenName, snap.exists);
}

export {
  rebuildAllDigests,
  rebuildIncidentDigests,
  rebuildInspectionDigests,
  rebuildRewardDigest,
  rebuildStudentDigest,
  type RebuildResult,
} from "./digests-rebuild";
