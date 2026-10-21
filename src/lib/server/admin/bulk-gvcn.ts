/**
 * Bulk GVCN accounts from the class list of a level (active classes with `homeroomEmail`).
 * Classes are grouped by email (one teacher may own several classes). Existing profiles get the classes added
 * (their role is never changed); existing Auth users without a profile are linked (re-secured with a temporary
 * password unless they are verified Google/Microsoft accounts, see `ensureAuthUser`); others are created with a
 * temporary password returned once.
 * `sync: true` also removes this level's class assignments whose class no longer names that teacher (homeroom
 * changes at a new school year), so former GVCNs lose student-level detail of their old classes.
 */
import type { WriteBatch } from "firebase-admin/firestore";
import { LEVEL_IDS } from "../../constants";
import type { BulkGvcnResult } from "../../contract";
import { COL } from "../../firestore-paths";
import type { ClassInfo, GvcnClassRef, LevelId, UserProfile } from "../../types";
import { auditOf, writeAudit } from "../audit";
import { invalidateProfileCache, requireLevel, sessionCutoffIso } from "../auth";
import { db, nowIso } from "../firebase-admin";
import type { ServiceCtx } from "../records";
import { loadReference } from "../reference";
import { commitInChunks } from "../write";
import { EMAIL_RE, mapLimit } from "./common";
import { dedupeClasses, ensureAuthUser, userRef } from "./users";

const AUTH_CONCURRENCY = 5;

function displayNameFor(email: string, classes: ClassInfo[]): string {
  const teacher = classes.map((c) => c.homeroomTeacher?.trim()).find((t) => t && t.length >= 2);
  return (teacher ?? email.split("@")[0]).slice(0, 120);
}

/** Levels of a GVCN's classes (LEVEL_IDS order), like `assignment()` in users.ts. */
function levelsOf(classes: readonly GvcnClassRef[]): LevelId[] {
  return LEVEL_IDS.filter((l) => classes.some((c) => c.levelId === l));
}

export async function bulkCreateGvcn(ctx: ServiceCtx, levelId: LevelId, opts: { sync?: boolean } = {}): Promise<BulkGvcnResult> {
  requireLevel(ctx.user, levelId);
  const ref = await loadReference(levelId);
  const result: BulkGvcnResult = { created: [], linkedExisting: [], skipped: [] };
  const groups = new Map<string, ClassInfo[]>();
  for (const c of ref.classes.filter((x) => x.active)) {
    const email = c.homeroomEmail?.trim().toLowerCase();
    if (!email) result.skipped.push({ classCode: c.code, reason: "Chưa có email GVCN." });
    else if (!EMAIL_RE.test(email)) result.skipped.push({ classCode: c.code, reason: `Email GVCN không hợp lệ: ${c.homeroomEmail}.` });
    else groups.set(email, [...(groups.get(email) ?? []), c]);
  }

  const usersSnap = await db().collection(COL.users).get();
  const profiles = usersSnap.docs.map((d) => d.data() as UserProfile);
  const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));
  const now = nowIso();
  const ops: Array<(b: WriteBatch) => void> = [];
  /** Existing profiles to rewrite (one write per document, applied after the adds and the sync). */
  const updated = new Map<string, UserProfile>();
  const touched: string[] = [];

  await mapLimit([...groups.entries()], AUTH_CONCURRENCY, async ([email, classes]) => {
    const refs = classes.map((c) => ({ levelId, classCode: c.code }));
    const codes = classes.map((c) => c.code);
    const existing = byEmail.get(email);
    if (existing) {
      const merged = dedupeClasses([...existing.gvcnClasses, ...refs]);
      if (merged.length !== existing.gvcnClasses.length) {
        const after: UserProfile = { ...existing, gvcnClasses: merged, updatedAt: now };
        if (existing.role === "GVCN") after.levels = levelsOf(merged);
        byEmail.set(email, after);
        updated.set(existing.uid, after);
        ops.push((b) =>
          writeAudit(b, auditOf(ctx.user, "UPDATE_USER", { entity: "user", entityId: existing.uid, levelId, ip: ctx.ip, detail: { email, bulkGvcn: true, addedClasses: codes } })),
        );
        touched.push(existing.uid);
      }
      for (const code of codes) result.linkedExisting.push({ email, classCode: code });
      return;
    }
    const displayName = displayNameFor(email, classes);
    const auth = await ensureAuthUser(email, displayName);
    const profile: UserProfile = {
      uid: auth.uid,
      email,
      displayName,
      role: "GVCN",
      levels: [levelId],
      gvcnClasses: refs,
      active: true,
      createdAt: now,
      ...(auth.resecured ? { sessionsValidAfter: sessionCutoffIso() } : {}),
    };
    ops.push((b) => b.create(userRef(auth.uid), profile));
    ops.push((b) =>
      writeAudit(
        b,
        auditOf(ctx.user, "CREATE_USER", {
          entity: "user",
          entityId: auth.uid,
          levelId,
          ip: ctx.ip,
          detail: { email, role: "GVCN", bulkGvcn: true, classes: codes, linkedExistingAuth: auth.linked, ...(auth.resecured ? { resecuredExistingAuth: true } : {}) },
        }),
      ),
    );
    touched.push(auth.uid);
    if (auth.tempPassword) result.created.push({ email, displayName, classCode: codes.join(", "), tempPassword: auth.tempPassword });
    else for (const code of codes) result.linkedExisting.push({ email, classCode: code });
  });

  if (opts.sync) {
    result.unassigned = [];
    for (const p of byEmail.values()) {
      const own = new Set((groups.get(p.email.toLowerCase()) ?? []).map((c) => c.code));
      const stale = p.gvcnClasses.filter((c) => c.levelId === levelId && !own.has(c.classCode));
      if (stale.length === 0) continue;
      const kept = p.gvcnClasses.filter((c) => !(c.levelId === levelId && !own.has(c.classCode)));
      const after: UserProfile = { ...p, gvcnClasses: kept, updatedAt: now };
      if (p.role === "GVCN") after.levels = levelsOf(kept);
      const removed = stale.map((c) => c.classCode);
      // A profile created above in this run is never stale (its classes come from `groups`).
      updated.set(p.uid, after);
      ops.push((b) =>
        writeAudit(b, auditOf(ctx.user, "UPDATE_USER", { entity: "user", entityId: p.uid, levelId, ip: ctx.ip, detail: { email: p.email, bulkGvcn: true, sync: true, removedClasses: removed } })),
      );
      touched.push(p.uid);
      for (const code of removed) result.unassigned.push({ email: p.email, classCode: code });
    }
    result.unassigned.sort((a, b) => a.classCode.localeCompare(b.classCode, "vi", { numeric: true }));
  }

  for (const [uid, after] of updated) ops.push((b) => b.set(userRef(uid), after));
  await commitInChunks(ops);
  for (const uid of touched) invalidateProfileCache(uid);
  result.created.sort((a, b) => a.classCode.localeCompare(b.classCode, "vi", { numeric: true }));
  result.linkedExisting.sort((a, b) => a.classCode.localeCompare(b.classCode, "vi", { numeric: true }));
  return result;
}
