/**
 * Level reference data (config + classes + catalog + weeks).
 * Canonical: levels/{id} { config } + subcollections classes/catalog/weeks.
 * Read model: digests/{id}__ref (one read). Defaults when nothing is stored:
 * config = defaultLevelConfig(levelId), weeks = generateWeeks(config.firstWeek, config.semesters).
 */
import type { DocumentReference, WriteBatch } from "firebase-admin/firestore";
import { defaultLevelConfig } from "../constants";
import { generateWeeks } from "../engine/dates";
import { COL, SUB, digestRefId } from "../firestore-paths";
import type { CatalogItem, ClassInfo, LevelConfig, LevelId, SchoolWeek } from "../types";
import { assertDigestSize } from "./digest-size";
import { db, nowIso } from "./firebase-admin";
import { bumpVersions } from "./versions";
import { commitInChunks, deleteDoc, readDoc, readQuery, setDoc, type Reader, type WriteTarget } from "./write";

export interface LevelReference {
  levelId: LevelId;
  config: LevelConfig;
  classes: ClassInfo[];
  catalog: CatalogItem[];
  weeks: SchoolWeek[];
  updatedAt: string;
}

export interface ReferenceDigestDoc extends LevelReference {
  kind: "ref";
}

/** Canonical reference + what is actually persisted (to diff writes). */
export interface CanonicalReference extends LevelReference {
  stored: {
    config: boolean;
    classes: Map<string, ClassInfo>;
    catalog: Map<string, CatalogItem>;
    weeks: Map<string, SchoolWeek>;
  };
}

export type ReferencePatch = Partial<Pick<LevelReference, "config" | "classes" | "catalog" | "weeks">>;

const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export const sortClasses = (xs: ClassInfo[]): ClassInfo[] =>
  [...xs].sort((a, b) => a.grade - b.grade || a.order - b.order || collator.compare(a.code, b.code));
export const sortCatalog = (xs: CatalogItem[]): CatalogItem[] => [...xs].sort((a, b) => collator.compare(a.code, b.code));
export const sortWeeks = (xs: SchoolWeek[]): SchoolWeek[] => [...xs].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

export function levelDocRef(levelId: LevelId): DocumentReference {
  return db().collection(COL.levels).doc(levelId);
}
export function referenceDigestRef(levelId: LevelId): DocumentReference {
  return db().collection(COL.digests).doc(digestRefId(levelId));
}
function subRef(levelId: LevelId, sub: keyof typeof SUB, id: string): DocumentReference {
  return levelDocRef(levelId).collection(SUB[sub]).doc(id);
}

export function findClass(ref: Pick<LevelReference, "classes">, code: string): ClassInfo | undefined {
  return ref.classes.find((c) => c.code === code);
}
export function findCatalogItem(ref: Pick<LevelReference, "catalog">, code: string): CatalogItem | undefined {
  return ref.catalog.find((c) => c.code === code);
}

/** Stored config merged over defaults (levelId always forced). */
export function normalizeConfig(levelId: LevelId, stored: Partial<LevelConfig> | undefined): LevelConfig {
  return { ...defaultLevelConfig(levelId), ...(stored ?? {}), levelId };
}

/** Read the canonical reference (doc + 3 subcollections) with defaults applied. Works inside a tx. */
export async function readCanonicalReference(levelId: LevelId, reader?: Reader): Promise<CanonicalReference> {
  const levelRef = levelDocRef(levelId);
  const [levelSnap, classSnap, catalogSnap, weekSnap] = await Promise.all([
    readDoc(reader, levelRef),
    readQuery(reader, levelRef.collection(SUB.classes)),
    readQuery(reader, levelRef.collection(SUB.catalog)),
    readQuery(reader, levelRef.collection(SUB.weeks)),
  ]);
  const storedConfig = (levelSnap.data() as { config?: Partial<LevelConfig> } | undefined)?.config;
  const config = normalizeConfig(levelId, storedConfig);
  const classes = new Map(classSnap.docs.map((d) => [d.id, d.data() as ClassInfo]));
  const catalog = new Map(catalogSnap.docs.map((d) => [d.id, d.data() as CatalogItem]));
  const weeks = new Map(weekSnap.docs.map((d) => [d.id, d.data() as SchoolWeek]));
  return {
    levelId,
    config,
    classes: sortClasses([...classes.values()]),
    catalog: sortCatalog([...catalog.values()]),
    weeks: weeks.size > 0 ? sortWeeks([...weeks.values()]) : generateWeeks(config.firstWeek, config.semesters),
    updatedAt: config.updatedAt ?? "",
    stored: { config: storedConfig !== undefined, classes, catalog, weeks },
  };
}

function fromDigest(levelId: LevelId, data: Partial<ReferenceDigestDoc>): LevelReference | undefined {
  if (!data.config || !Array.isArray(data.classes) || !Array.isArray(data.catalog) || !Array.isArray(data.weeks)) return undefined;
  return {
    levelId,
    config: normalizeConfig(levelId, data.config),
    classes: data.classes,
    catalog: data.catalog,
    weeks: data.weeks,
    updatedAt: data.updatedAt ?? "",
  };
}

/** Reference for business logic: the `__ref` digest (1 read) or, if absent, the canonical docs. */
export async function loadReference(levelId: LevelId, reader?: Reader): Promise<LevelReference> {
  const snap = await readDoc(reader, referenceDigestRef(levelId));
  const ref = snap.exists ? fromDigest(levelId, snap.data() as Partial<ReferenceDigestDoc>) : undefined;
  if (ref) return ref;
  const { stored: _stored, ...canonical } = await readCanonicalReference(levelId, reader);
  return canonical;
}

/** Write digests/{level}__ref from a reference (size-guarded). */
export function writeReferenceDigest(target: WriteTarget, ref: LevelReference): void {
  const doc: ReferenceDigestDoc = {
    kind: "ref",
    levelId: ref.levelId,
    config: ref.config,
    classes: sortClasses(ref.classes),
    catalog: sortCatalog(ref.catalog),
    weeks: sortWeeks(ref.weeks),
    updatedAt: nowIso(),
  };
  assertDigestSize(digestRefId(ref.levelId), doc);
  setDoc(target, referenceDigestRef(ref.levelId), doc);
}

/** Rebuild `__ref` from canonical docs and bump the level version. */
export async function rebuildReferenceDigest(levelId: LevelId, opts: { bump?: boolean } = {}): Promise<LevelReference> {
  const { stored: _stored, ...ref } = await readCanonicalReference(levelId);
  const batch = db().batch();
  writeReferenceDigest(batch, ref);
  if (opts.bump !== false) bumpVersions(batch, [levelId]);
  await batch.commit();
  return ref;
}

type Op = (t: WriteTarget) => void;

function diffCollection<T>(
  levelId: LevelId,
  sub: keyof typeof SUB,
  stored: Map<string, T>,
  next: T[],
  keyOf: (x: T) => string,
): Op[] {
  const ops: Op[] = [];
  const nextKeys = new Set<string>();
  for (const item of next) {
    const key = keyOf(item);
    nextKeys.add(key);
    const old = stored.get(key);
    if (!old || JSON.stringify(old) !== JSON.stringify(item)) {
      ops.push((t) => setDoc(t, subRef(levelId, sub, key), item as Record<string, unknown>));
    }
  }
  for (const key of stored.keys()) if (!nextKeys.has(key)) ops.push((t) => deleteDoc(t, subRef(levelId, sub, key)));
  return ops;
}

/**
 * Plan canonical writes for a patch (only changed docs are written; removed items deleted).
 * Returns the resulting reference and the write operations (digest NOT included).
 */
export function planReferenceWrites(existing: CanonicalReference, patch: ReferencePatch): { next: LevelReference; ops: Op[] } {
  const levelId = existing.levelId;
  const config = patch.config ? { ...patch.config, levelId } : existing.config;
  // No stored calendar: the weeks are generated from the config, so a new config means new weeks (as
  // readCanonicalReference would compute them) – the `__ref` digest must not keep the old generated calendar.
  const generated = existing.stored.weeks.size === 0 && patch.config ? generateWeeks(config.firstWeek, config.semesters) : undefined;
  const next: LevelReference = {
    levelId,
    config,
    classes: patch.classes ? sortClasses(patch.classes.map((c) => ({ ...c, levelId }))) : existing.classes,
    catalog: patch.catalog ? sortCatalog(patch.catalog) : existing.catalog,
    weeks: patch.weeks ? sortWeeks(patch.weeks) : generated ?? existing.weeks,
    updatedAt: nowIso(),
  };
  const ops: Op[] = [];
  if (patch.config) ops.push((t) => setDoc(t, levelDocRef(levelId), { config: next.config }, true));
  if (patch.classes) ops.push(...diffCollection(levelId, "classes", existing.stored.classes, next.classes, (c) => c.code));
  if (patch.catalog) ops.push(...diffCollection(levelId, "catalog", existing.stored.catalog, next.catalog, (c) => c.code));
  if (patch.weeks) ops.push(...diffCollection(levelId, "weeks", existing.stored.weeks, next.weeks, (w) => w.weekStart));
  return { next, ops };
}

/** Apply a patch inside ONE tx/batch: canonical diff + `__ref` digest (caller bumps versions + audits). */
export function writeReferenceParts(target: WriteTarget, existing: CanonicalReference, patch: ReferencePatch): { next: LevelReference; ops: number } {
  const { next, ops } = planReferenceWrites(existing, patch);
  for (const op of ops) op(target);
  writeReferenceDigest(target, next);
  return { next, ops: ops.length + 1 };
}

/**
 * Read canonical → diff → commit in ≤450-op batches. The LAST batch carries the `__ref` digest,
 * meta/versions bump and `final` (e.g. writeAudit). Not atomic across chunks (admin-only operation).
 */
export async function saveReferenceParts(
  levelId: LevelId,
  patch: ReferencePatch,
  final?: (b: WriteBatch, next: LevelReference) => void,
): Promise<LevelReference> {
  const existing = await readCanonicalReference(levelId);
  const { next, ops } = planReferenceWrites(existing, patch);
  await commitInChunks(
    ops,
    (b) => {
      writeReferenceDigest(b, next);
      bumpVersions(b, [levelId]);
      final?.(b, next);
    },
    5,
  );
  return next;
}
