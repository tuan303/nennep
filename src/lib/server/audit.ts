/**
 * Append-only audit log (BR-AUD-01). Entries are written with auto ids into `auditLogs/` and are never
 * updated or deleted by the app. Prefer `writeAudit(tx|batch, …)` so the log commits atomically with the change.
 */
import type { AuditAction, AuditLog, LevelId } from "../types";
import { COL } from "../firestore-paths";
import { canonicalJson } from "./admin/hash";
import { db, nowIso } from "./firebase-admin";
import type { SessionUser } from "./auth";
import { setDoc, type WriteTarget } from "./write";

export type AuditEntry = Omit<AuditLog, "id" | "ts"> & { ts?: string };

/** Who did it: uid/email/role (+ ip) of a signed-in user. */
export function auditActor(user: SessionUser, ip?: string): Pick<AuditLog, "uid" | "email" | "role" | "ip"> {
  const actor: Pick<AuditLog, "uid" | "email" | "role" | "ip"> = {
    uid: user.uid,
    email: user.email,
    role: user.profile.role,
  };
  if (ip) actor.ip = ip;
  return actor;
}

/** Convenience: full entry for a signed-in actor. */
export function auditOf(
  user: SessionUser,
  action: AuditAction,
  extra: { entity?: string; entityId?: string; levelId?: LevelId; detail?: Record<string, unknown>; ip?: string } = {},
): AuditEntry {
  const { ip, ...rest } = extra;
  return { ...auditActor(user, ip), action, ...rest };
}

/** JSON round-trip: drops undefined/functions, converts Dates; keeps the log JSON-serialisable. */
function sanitizeDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  return JSON.parse(JSON.stringify(detail)) as Record<string, unknown>;
}

function buildLog(id: string, entry: AuditEntry): AuditLog {
  const log: AuditLog = {
    id,
    ts: entry.ts ?? nowIso(),
    uid: entry.uid,
    email: (entry.email ?? "").toLowerCase(),
    role: entry.role,
    action: entry.action,
  };
  if (entry.entity) log.entity = entry.entity;
  if (entry.entityId) log.entityId = entry.entityId;
  if (entry.levelId) log.levelId = entry.levelId;
  const detail = sanitizeDetail(entry.detail);
  if (detail) log.detail = detail;
  if (entry.ip) log.ip = entry.ip;
  return log;
}

/** Add an audit entry to a transaction/batch. Returns the new log id. */
export function writeAudit(target: WriteTarget, entry: AuditEntry): string {
  const ref = db().collection(COL.auditLogs).doc();
  setDoc(target, ref, buildLog(ref.id, entry));
  return ref.id;
}

/** Write an audit entry on its own (for events without another write, e.g. LOGIN_FAILED). */
export async function writeAuditDirect(entry: AuditEntry): Promise<string> {
  const ref = db().collection(COL.auditLogs).doc();
  await ref.create(buildLog(ref.id, entry));
  return ref.id;
}

/**
 * Field-level diff for UPDATE_* audit details: `{ field: { before, after } }` for every changed field
 * (deep comparison via canonical JSON: object key order is ignored). Returns {} when nothing changed.
 */
export function auditDiff<T extends object>(
  before: T,
  after: T,
  fields: ReadonlyArray<keyof T & string>,
): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const f of fields) {
    const b = before[f];
    const a = after[f];
    // Key order never counts: Firestore returns stored maps with sorted keys, inputs keep the schema's order.
    if (canonicalJson(b ?? null) !== canonicalJson(a ?? null)) out[f] = { before: b ?? null, after: a ?? null };
  }
  return out;
}
