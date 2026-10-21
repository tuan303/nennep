/**
 * Building blocks shared by incident/reward services (and reusable by imports/actions):
 * edit rights, idempotency keys, evidence-id checks, student lookups.
 */
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { EDITOR_EDIT_WINDOW_HOURS, hasPermission } from "../constants";
import { snapshotCatalogItem } from "../engine/edit-context";
import { COL, idempotencyId } from "../firestore-paths";
import type { CatalogItem, Incident, LevelId, Student, StudentLite } from "../types";
import type { SessionUser } from "./auth";
import { Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";
import { readDocs, type Reader } from "./write";

/** Context passed by routes to services. */
export interface ServiceCtx {
  user: SessionUser;
  ip?: string;
  /** VN calendar date used for "not in the future" checks (default todayVN()). */
  today?: string;
}

export const EDIT_WINDOW_MESSAGE = `Chỉ được sửa bản ghi của mình trong ${EDITOR_EDIT_WINDOW_HOURS} giờ`;

/** True if the user may edit the record (ADMIN: any; EDITOR: own within EDITOR_EDIT_WINDOW_HOURS). */
export function canEditRecord(user: SessionUser, record: { createdBy: string; createdAt: string }, now: number = Date.now()): boolean {
  if (hasPermission(user.profile, "record.editAny")) return true;
  if (!hasPermission(user.profile, "record.editOwnRecent")) return false;
  const created = Date.parse(record.createdAt);
  return record.createdBy === user.uid && Number.isFinite(created) && now - created <= EDITOR_EDIT_WINDOW_HOURS * 3_600_000;
}

/** Throws 403 with the edit-window message for editors, generic 403 for others. */
export function assertCanEditRecord(user: SessionUser, record: { createdBy: string; createdAt: string }, now: number = Date.now()): void {
  if (canEditRecord(user, record, now)) return;
  if (hasPermission(user.profile, "record.editOwnRecent")) throw Errors.forbidden(EDIT_WINDOW_MESSAGE);
  throw Errors.forbidden();
}

/* -------------------------------- idempotency ------------------------------- */

export type IdempotencyKind = "incident" | "reward" | "action";

export interface IdempotencyDoc {
  kind: IdempotencyKind;
  id: string;
  createdAt: string;
}

export function idempotencyRef(uid: string, clientRequestId: string): DocumentReference {
  return db().collection(COL.idempotency).doc(idempotencyId(uid, clientRequestId));
}

/** READ phase: previously created record id for (uid, clientRequestId, kind), if any. */
export async function readIdempotency(tx: Transaction, uid: string, clientRequestId: string | undefined, kind: IdempotencyKind): Promise<string | undefined> {
  if (!clientRequestId) return undefined;
  const snap = await tx.get(idempotencyRef(uid, clientRequestId));
  const data = snap.data() as IdempotencyDoc | undefined;
  return data && data.kind === kind ? data.id : undefined;
}

/** WRITE phase: remember which record a clientRequestId produced. */
export function writeIdempotency(tx: Transaction, uid: string, clientRequestId: string | undefined, kind: IdempotencyKind, id: string): void {
  if (!clientRequestId) return;
  const doc: IdempotencyDoc = { kind, id, createdAt: nowIso() };
  tx.set(idempotencyRef(uid, clientRequestId), doc);
}

/* ---------------------------------- lookups --------------------------------- */

/**
 * READ phase: students by id (missing ids are simply absent from the map).
 * With `levelId`, students of other levels are treated as missing.
 */
export async function readStudentLites(
  reader: Reader,
  ids: readonly string[],
  levelId?: LevelId,
): Promise<Map<string, StudentLite & { levelId: LevelId }>> {
  const unique = [...new Set(ids)];
  const snaps = await readDocs(
    reader,
    unique.map((id) => db().collection(COL.students).doc(id)),
  );
  const out = new Map<string, StudentLite & { levelId: LevelId }>();
  for (const s of snaps) {
    if (!s.exists) continue;
    const st = s.data() as Student;
    if (levelId && st.levelId !== levelId) continue;
    const lite: StudentLite & { levelId: LevelId } = {
      id: s.id,
      name: st.name,
      classCode: st.classCode,
      grade: st.grade,
      status: st.status,
      levelId: st.levelId,
    };
    if (st.dob) lite.dob = st.dob;
    out.set(s.id, lite);
  }
  return out;
}

/** READ phase: every photo id must be an evidence doc of the same level (400 otherwise). */
export async function assertEvidenceIds(reader: Reader, levelId: LevelId, photoIds: readonly string[]): Promise<void> {
  const unique = [...new Set(photoIds)];
  if (unique.length === 0) return;
  const refs = unique.map((id) => db().collection(COL.evidence).doc(id));
  const snaps = reader ? await reader.getAll(...refs, { fieldMask: ["levelId"] }) : await db().getAll(...refs, { fieldMask: ["levelId"] });
  const bad = snaps.filter((s) => !s.exists || (s.data() as { levelId?: string }).levelId !== levelId);
  if (bad.length > 0) throw Errors.validation("Ảnh minh chứng không tồn tại hoặc không thuộc cấp học này.");
}

/**
 * Evidence links must be http(s): `z.string().url()` also accepts `javascript:`/`data:` URLs, which would be
 * an XSS vector when rendered as links. Throws 400.
 */
export function assertHttpUrls(urls: readonly string[]): void {
  for (const u of urls) {
    let ok = false;
    try {
      const p = new URL(u).protocol;
      ok = p === "http:" || p === "https:";
    } catch {
      ok = false;
    }
    if (!ok) throw Errors.validation("Đường dẫn minh chứng phải bắt đầu bằng http:// hoặc https://.", [{ path: "evidenceUrls", message: u }]);
  }
}

/* ------------------------------ evidence links ------------------------------ */

export interface EvidenceLinkPlan {
  attach: string[];
  detach: string[];
}

/**
 * READ phase: photos newly attached to `recordId` (already checked by `assertEvidenceIds`) and photos removed from it
 * that still point to it. Unattached photos can be purged by the admin (Bảo trì) after a grace period.
 */
export async function planEvidenceLinks(tx: Transaction, recordId: string, before: readonly string[], after: readonly string[]): Promise<EvidenceLinkPlan> {
  const attach = [...new Set(after.filter((id) => !before.includes(id)))];
  const removed = [...new Set(before.filter((id) => !after.includes(id)))];
  if (removed.length === 0) return { attach, detach: [] };
  const snaps = await tx.getAll(...removed.map((id) => db().collection(COL.evidence).doc(id)), { fieldMask: ["attachedTo"] });
  const detach = snaps.filter((snap) => snap.exists && snap.get("attachedTo") === recordId).map((snap) => snap.id);
  return { attach, detach };
}

/** WRITE phase of `planEvidenceLinks`. */
export function writeEvidenceLinks(tx: Transaction, recordId: string, plan: EvidenceLinkPlan): void {
  const at = nowIso();
  for (const id of plan.attach) tx.update(db().collection(COL.evidence).doc(id), { attachedTo: recordId, attachedAt: at });
  for (const id of plan.detach) tx.update(db().collection(COL.evidence).doc(id), { attachedTo: FieldValue.delete(), attachedAt: FieldValue.delete() });
}

/* -------------------------------- snapshots -------------------------------- */

/** Catalog item reconstructed from an incident's snapshot (keeps historical penalty/unit on edits and re-imports) – the engine's `snapshotCatalogItem`. */
export const catalogFromSnapshot: (i: Pick<Incident, "errorCode" | "category" | "issue" | "group" | "penalty" | "unit">) => CatalogItem = snapshotCatalogItem;

/** Next revision of a record (optimistic concurrency, see `assertBaseRev`). */
export function nextRev(record: { rev?: number }): number {
  return (record.rev ?? 0) + 1;
}

/** 409 when the client edited an older revision than the stored one (`baseRev` omitted = no check). */
export function assertBaseRev(record: { rev?: number }, baseRev: number | undefined, message: string): void {
  if (baseRev !== undefined && baseRev !== (record.rev ?? 0)) throw Errors.conflict(message);
}

/** Shallow copy without the given keys. */
export function omitKeys<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Shallow copy where the listed OPTIONAL keys are removed when undefined or "" (optional fields are
 * omitted in Firestore, never null). Required string fields (e.g. semester "") must not be listed.
 */
export function omitEmpty<T extends object>(obj: T, keys: ReadonlyArray<keyof T>): T {
  const out = { ...obj };
  for (const k of keys) {
    const v = out[k] as unknown;
    if (v === undefined || v === "") delete out[k];
  }
  return out;
}
