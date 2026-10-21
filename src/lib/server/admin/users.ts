/**
 * User accounts (Cài đặt → Người dùng): Firebase Auth user + users/{uid} profile.
 * Rules: an email gets one profile; an existing Auth user with that email is linked instead of duplicated, but
 * unless it is a verified federated (Google/Microsoft) account of that same address it is RE-SECURED first (new
 * temporary password, other providers/MFA removed, sessions revoked) – someone may have registered the address
 * through the public sign-up API before the admin created the account (account pre-hijacking).
 * The last active school-wide ADMIN can never lose the role / be locked / be restricted to some levels, and admins
 * cannot change their own role, levels or lock themselves. users.manage is a school-wide permission
 * (`ALL_LEVEL_PERMISSIONS`): level-limited admins never reach these services.
 */
import type { UserRecord } from "firebase-admin/auth";
import type { Transaction } from "firebase-admin/firestore";
import type { z } from "zod";
import { LEVEL_IDS, ROLES, hasAllLevels } from "../../constants";
import type { UserCreateResult, UserCreateSchema, UserUpdateSchema } from "../../contract";
import { compareVN } from "../../engine/text";
import { COL } from "../../firestore-paths";
import type { GvcnClassRef, LevelId, Role, UserProfile } from "../../types";
import { auditDiff, auditOf, writeAudit } from "../audit";
import { invalidateProfileCache, sessionCutoffIso, type SessionUser } from "../auth";
import { Errors } from "../errors";
import { adminAuth, db, nowIso } from "../firebase-admin";
import type { ServiceCtx } from "../records";
import { findClass, loadReference } from "../reference";
import { runTx, type Reader } from "../write";
import { errorCode } from "./common";
import { generateTempPassword } from "./passwords";

export type UserCreateData = z.output<typeof UserCreateSchema>;
export type UserUpdateData = z.output<typeof UserUpdateSchema>;

export const USER_MSG = {
  notFound: "Không tìm thấy người dùng.",
  duplicate: "Email này đã có tài khoản trong hệ thống.",
  gvcnNeedsClass: "GVCN cần được gán ít nhất một lớp chủ nhiệm.",
  lastAdmin: "Không thể bỏ quyền hoặc khóa quản trị viên cuối cùng.",
  self: "Bạn không thể tự bỏ quyền quản trị hoặc tự khóa tài khoản của mình.",
  selfScope: "Bạn không thể tự thay đổi cấp học của tài khoản mình.",
  widerScope: "Bạn không có quyền quản lý tài khoản có phạm vi rộng hơn tài khoản của mình.",
} as const;

export const USER_AUDIT_FIELDS = ["displayName", "role", "levels", "gvcnClasses", "active"] as const satisfies ReadonlyArray<keyof UserProfile>;

export function userRef(uid: string) {
  return db().collection(COL.users).doc(uid);
}

export function dedupeClasses(list: readonly GvcnClassRef[]): GvcnClassRef[] {
  const seen = new Set<string>();
  const out: GvcnClassRef[] = [];
  for (const c of list) {
    const key = `${c.levelId}|${c.classCode}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ levelId: c.levelId, classCode: c.classCode });
    }
  }
  return out;
}

function normalizeLevels(levels: readonly LevelId[]): LevelId[] {
  return LEVEL_IDS.filter((l) => levels.includes(l));
}

/** Role-specific shape: GVCN needs ≥ 1 class (levels = levels of those classes); other roles keep their levels. */
function assignment(role: Role, levels: readonly LevelId[], gvcnClasses: readonly GvcnClassRef[]): Pick<UserProfile, "levels" | "gvcnClasses"> {
  const classes = dedupeClasses(gvcnClasses);
  if (role === "GVCN") {
    if (classes.length === 0) throw Errors.validation(USER_MSG.gvcnNeedsClass);
    return { levels: normalizeLevels(classes.map((c) => c.levelId)), gvcnClasses: classes };
  }
  return { levels: normalizeLevels(levels), gvcnClasses: classes };
}

/** READ: every GVCN class must exist in its level. */
async function assertClassesExist(reader: Reader, classes: readonly GvcnClassRef[]): Promise<void> {
  const levels = [...new Set(classes.map((c) => c.levelId))];
  const refs = await Promise.all(levels.map((l) => loadReference(l, reader)));
  const missing = classes.filter((c) => !findClass(refs[levels.indexOf(c.levelId)], c.classCode));
  if (missing.length > 0) throw Errors.validation(`Lớp không có trong danh mục: ${missing.map((c) => `${c.classCode} (${c.levelId})`).join(", ")}.`);
}

const roleRank = (r: Role) => ROLES.indexOf(r);

/** GET /api/users — every profile, by role then name. */
export async function listUsers(): Promise<UserProfile[]> {
  const snap = await db().collection(COL.users).get();
  return snap.docs.map((d) => d.data() as UserProfile).sort((a, b) => roleRank(a.role) - roleRank(b.role) || compareVN(a.displayName, b.displayName));
}

export async function findProfileByEmail(email: string): Promise<UserProfile | undefined> {
  const snap = await db().collection(COL.users).where("email", "==", email.toLowerCase()).limit(1).get();
  return snap.empty ? undefined : (snap.docs[0].data() as UserProfile);
}

/** Federated providers that only the owner of the mailbox can sign in with (when the address is verified). */
const TRUSTED_LINK_PROVIDERS: ReadonlySet<string> = new Set(["google.com", "microsoft.com"]);

/**
 * May an Auth user that existed BEFORE the admin created the profile be linked as it is? Only a verified account
 * whose every provider is Google/Microsoft for this very address. A password (or phone/other) provider, an
 * unverified address or a foreign provider email means someone else may have created it.
 */
export function isTrustedExistingAuthUser(u: Pick<UserRecord, "emailVerified" | "providerData">, email: string): boolean {
  if (!u.emailVerified || u.providerData.length === 0) return false;
  return u.providerData.every((p) => TRUSTED_LINK_PROVIDERS.has(p.providerId) && (p.email ?? "").toLowerCase() === email.toLowerCase());
}

export interface EnsuredAuthUser {
  uid: string;
  /** Generated temporary password (new user, or re-secured existing user without an explicit password). */
  tempPassword?: string;
  /** An Auth user with this email already existed. */
  linked: boolean;
  /** The existing Auth user was re-secured: password replaced, other providers / MFA removed, sessions revoked. */
  resecured: boolean;
}

/**
 * Create or link the Firebase Auth user of `email` for a NEW profile. Returns the uid and, when the caller gave no
 * password, the generated temporary password (also for an existing account that had to be re-secured).
 */
export async function ensureAuthUser(email: string, displayName: string, password?: string): Promise<EnsuredAuthUser> {
  let existing: UserRecord | undefined;
  try {
    existing = await adminAuth().getUserByEmail(email);
  } catch (e) {
    if (errorCode(e) !== "auth/user-not-found") throw e;
  }
  if (!existing) {
    const tempPassword = password ? undefined : generateTempPassword();
    const created = await adminAuth().createUser({ email, password: password ?? tempPassword, displayName });
    return { uid: created.uid, tempPassword, linked: false, resecured: false };
  }
  if (isTrustedExistingAuthUser(existing, email)) {
    if (password || existing.disabled) await adminAuth().updateUser(existing.uid, { ...(password ? { password } : {}), disabled: false });
    if (password) await adminAuth().revokeRefreshTokens(existing.uid);
    return { uid: existing.uid, linked: true, resecured: false };
  }
  const tempPassword = password ? undefined : generateTempPassword();
  const providersToUnlink = existing.providerData.map((p) => p.providerId).filter((id) => id !== "password");
  await adminAuth().updateUser(existing.uid, {
    password: password ?? tempPassword,
    disabled: false,
    ...(providersToUnlink.length > 0 ? { providersToUnlink } : {}),
    ...((existing.multiFactor?.enrolledFactors.length ?? 0) > 0 ? { multiFactor: { enrolledFactors: null } } : {}),
  });
  await adminAuth().revokeRefreshTokens(existing.uid);
  return { uid: existing.uid, tempPassword, linked: true, resecured: true };
}

/** A profile's scope is covered by the caller's: callers without level restriction cover everyone. */
export function coversScope(caller: Pick<UserProfile, "role" | "levels">, target: Pick<UserProfile, "role" | "levels" | "gvcnClasses">): boolean {
  if (hasAllLevels(caller)) return true;
  const targetLevels = target.role === "GVCN" ? target.gvcnClasses.map((c) => c.levelId) : target.levels;
  if (target.role !== "GVCN" && targetLevels.length === 0) return false;
  return targetLevels.every((l) => caller.levels.includes(l));
}

function assertCanManage(caller: SessionUser, target: Pick<UserProfile, "role" | "levels" | "gvcnClasses">): void {
  if (!coversScope(caller.profile, target)) throw Errors.forbidden(USER_MSG.widerScope);
}

/** POST /api/users — creates (or links) the Auth user and the profile; the temp password is returned once. */
export async function createUser(ctx: ServiceCtx, input: UserCreateData): Promise<UserCreateResult> {
  const email = input.email.toLowerCase();
  const shape = assignment(input.role, input.levels, input.gvcnClasses);
  await assertClassesExist(undefined, shape.gvcnClasses);
  if (await findProfileByEmail(email)) throw Errors.conflict(USER_MSG.duplicate);

  assertCanManage(ctx.user, { role: input.role, ...shape });
  const auth = await ensureAuthUser(email, input.displayName, input.password);
  const profile: UserProfile = {
    uid: auth.uid,
    email,
    displayName: input.displayName,
    role: input.role,
    ...shape,
    active: true,
    createdAt: nowIso(),
    // Any ID token minted before the account was re-secured (e.g. by whoever registered the address) is void.
    ...(auth.resecured ? { sessionsValidAfter: sessionCutoffIso() } : {}),
  };
  const batch = db().batch();
  batch.create(userRef(auth.uid), profile);
  writeAudit(
    batch,
    auditOf(ctx.user, "CREATE_USER", {
      entity: "user",
      entityId: auth.uid,
      ip: ctx.ip,
      detail: {
        email,
        role: profile.role,
        levels: profile.levels,
        gvcnClasses: profile.gvcnClasses,
        linkedExistingAuth: auth.linked,
        ...(auth.resecured ? { resecuredExistingAuth: true } : {}),
      },
    }),
  );
  try {
    await batch.commit();
  } catch (e) {
    if (errorCode(e) === 6) throw Errors.conflict(USER_MSG.duplicate);
    throw e;
  }
  invalidateProfileCache(auth.uid);
  return auth.tempPassword ? { profile, tempPassword: auth.tempPassword } : { profile };
}

/** A school-wide administrator: active ADMIN without level restriction (the only one holding users.manage). */
function isSchoolAdmin(p: Pick<UserProfile, "role" | "active" | "levels">): boolean {
  return p.role === "ADMIN" && p.active && p.levels.length === 0;
}

/** READ: other active school-wide admins besides `uid`. */
async function otherSchoolAdmins(tx: Transaction, uid: string): Promise<number> {
  const snap = await tx.get(db().collection(COL.users).where("role", "==", "ADMIN").where("active", "==", true));
  return snap.docs.filter((d) => d.id !== uid && isSchoolAdmin(d.data() as UserProfile)).length;
}

/** PATCH /api/users/:uid — role / levels / GVCN classes / active / display name. */
export async function updateUser(ctx: ServiceCtx, uid: string, patch: UserUpdateData): Promise<UserProfile> {
  const { before, after } = await runTx(async (tx) => {
    const snap = await tx.get(userRef(uid));
    if (!snap.exists) throw Errors.notFound(USER_MSG.notFound);
    const before = snap.data() as UserProfile;
    assertCanManage(ctx.user, before);
    const role = patch.role ?? before.role;
    const shape = assignment(role, patch.levels ?? before.levels, patch.gvcnClasses ?? before.gvcnClasses);
    const next: UserProfile = { ...before, displayName: patch.displayName ?? before.displayName, role, ...shape, active: patch.active ?? before.active };
    const changes = auditDiff(before, next, USER_AUDIT_FIELDS);
    if (Object.keys(changes).length === 0) return { before, after: before };
    assertCanManage(ctx.user, next);
    if (isSchoolAdmin(before) && !isSchoolAdmin(next) && (await otherSchoolAdmins(tx, uid)) === 0) throw Errors.validation(USER_MSG.lastAdmin);
    if (uid === ctx.user.uid) {
      if (changes.active || changes.role) throw Errors.validation(USER_MSG.self);
      if (changes.levels) throw Errors.validation(USER_MSG.selfScope);
    }
    if (changes.gvcnClasses) await assertClassesExist(tx, next.gvcnClasses);
    const after: UserProfile = {
      ...next,
      updatedAt: nowIso(),
      // Locking voids every session issued before, also after a later unlock.
      ...(before.active && !next.active ? { sessionsValidAfter: sessionCutoffIso() } : {}),
    };
    tx.set(userRef(uid), after);
    writeAudit(tx, auditOf(ctx.user, "UPDATE_USER", { entity: "user", entityId: uid, ip: ctx.ip, detail: { email: before.email, changes } }));
    return { before, after };
  });
  if (after === before) return before;
  invalidateProfileCache(uid);
  if (after.active !== before.active || after.displayName !== before.displayName) {
    try {
      await adminAuth().updateUser(uid, { disabled: !after.active, displayName: after.displayName });
      if (!after.active) await adminAuth().revokeRefreshTokens(uid);
    } catch (e) {
      if (errorCode(e) !== "auth/user-not-found") throw e;
    }
  }
  return after;
}

/**
 * POST /api/users/:uid/reset-password — new temporary password (returned once, never logged). Every session of
 * the account ends: refresh tokens are revoked in Firebase Auth and ID tokens already issued are rejected by
 * `authenticate` through `sessionsValidAfter` (the ID token itself would otherwise stay valid for up to 1 h).
 */
export async function resetPassword(ctx: ServiceCtx, uid: string): Promise<{ tempPassword: string }> {
  const snap = await userRef(uid).get();
  if (!snap.exists) throw Errors.notFound(USER_MSG.notFound);
  const profile = snap.data() as UserProfile;
  assertCanManage(ctx.user, profile);
  const tempPassword = generateTempPassword();
  try {
    await adminAuth().updateUser(uid, { password: tempPassword });
  } catch (e) {
    if (errorCode(e) !== "auth/user-not-found") throw e;
    await adminAuth().createUser({ uid, email: profile.email, password: tempPassword, displayName: profile.displayName });
  }
  await adminAuth().revokeRefreshTokens(uid);
  const batch = db().batch();
  batch.update(userRef(uid), { sessionsValidAfter: sessionCutoffIso() });
  writeAudit(batch, auditOf(ctx.user, "RESET_PASSWORD", { entity: "user", entityId: uid, ip: ctx.ip, detail: { email: profile.email, sessionsRevoked: true } }));
  await batch.commit();
  invalidateProfileCache(uid);
  return { tempPassword };
}
