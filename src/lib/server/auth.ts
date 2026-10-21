/**
 * Server-side authentication & authorisation.
 * Bearer Firebase ID token → verified → users/{uid} profile (60 s in-memory cache) → SessionUser.
 */
import type { DecodedIdToken } from "firebase-admin/auth";
import type { MeResponse } from "../contract";
import { LEVEL_IDS, canAccessLevel, canSeeClassDetail, hasPermission, type Permission } from "../constants";
import { COL } from "../firestore-paths";
import type { LevelId, UserProfile } from "../types";
import { writeAudit } from "./audit";
import { Errors } from "./errors";
import { adminAuth, db, nowIso } from "./firebase-admin";

export interface SessionUser {
  uid: string;
  /** Lower-cased email (profile email, falling back to the token email). */
  email: string;
  profile: UserProfile;
}

export const PROFILE_CACHE_TTL_MS = 60_000;

const profileCache = new Map<string, { profile: UserProfile; expires: number }>();

export const AUTH_MSG = {
  missingToken: "Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.",
  expired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  revoked: "Phiên đăng nhập đã bị thu hồi (mật khẩu vừa được đặt lại hoặc tài khoản vừa được bảo vệ lại). Vui lòng đăng nhập lại.",
  invalid: "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
  locked: "Tài khoản đã bị khóa",
  noProfile: "Tài khoản chưa được cấp quyền. Vui lòng liên hệ quản trị.",
  level: "Bạn không có quyền truy cập dữ liệu của cấp học này.",
  classDetail: "Bạn chỉ được xem chi tiết học sinh của lớp mình phụ trách.",
} as const;

/** Drop one cached profile (after profile edits) or the whole cache (no argument). */
export function invalidateProfileCache(uid?: string): void {
  if (uid === undefined) profileCache.clear();
  else profileCache.delete(uid);
}

/** Replace the cached profile (e.g. after updating lastLoginAt). */
export function primeProfileCache(profile: UserProfile): void {
  profileCache.set(profile.uid, { profile, expires: Date.now() + PROFILE_CACHE_TTL_MS });
}

export function bootstrapAdminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function firebaseErrorCode(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "";
}

/**
 * Verify the Bearer ID token (401 on missing/invalid/expired).
 * Production does NOT ask Firebase Auth whether the token was revoked or the user disabled (that would cost one
 * Auth backend call per request; firebase-admin only does it with `checkRevoked` or on the emulator). Access is
 * cut by the profile instead: `active=false` (lock in Cài đặt → Người dùng, never in the Firebase console) and
 * `sessionsValidAfter` (password reset / lock / re-secured account), see `assertSessionValid`.
 */
export async function verifyRequestToken(req: Request): Promise<DecodedIdToken> {
  const token = bearerToken(req);
  if (!token) throw Errors.unauthenticated(AUTH_MSG.missingToken);
  try {
    return await adminAuth().verifyIdToken(token);
  } catch (e) {
    const code = firebaseErrorCode(e);
    if (code === "auth/id-token-expired") throw Errors.unauthenticated(AUTH_MSG.expired);
    // Only reachable on the emulator (see above); production relies on profile.active.
    if (code === "auth/user-disabled") throw Errors.forbidden(AUTH_MSG.locked);
    if (code === "auth/id-token-revoked") throw Errors.unauthenticated(AUTH_MSG.revoked);
    throw Errors.unauthenticated(AUTH_MSG.invalid);
  }
}

/** Sign-in providers whose `email_verified` claim proves control of the mailbox (bootstrap only). */
const BOOTSTRAP_PROVIDERS: ReadonlySet<string> = new Set(["password", "google.com", "microsoft.com"]);

/**
 * BOOTSTRAP_ADMIN_EMAILS may only turn a token into an ADMIN when the e-mail address is verified (anyone can
 * register an unverified address through the public sign-up API) and as long as the school has no active ADMIN
 * yet: once an administrator exists, accounts are created in the app or with `npm run create-admin`.
 */
async function bootstrapAllowed(token: DecodedIdToken, email: string): Promise<boolean> {
  if (!email || !bootstrapAdminEmails().includes(email)) return false;
  if (token.email_verified !== true) return false;
  if (!BOOTSTRAP_PROVIDERS.has(token.firebase?.sign_in_provider ?? "")) return false;
  const admins = await db().collection(COL.users).where("role", "==", "ADMIN").where("active", "==", true).limit(1).get();
  return admins.empty;
}

/** Second-precision ISO timestamp ("now" floored to the second, comparable with the token's `auth_time`). */
export function sessionCutoffIso(now: number = Date.now()): string {
  return new Date(Math.floor(now / 1000) * 1000).toISOString();
}

/** 401 when the token was issued by a sign-in older than `profile.sessionsValidAfter`. */
export function assertSessionValid(token: Pick<DecodedIdToken, "auth_time">, profile: Pick<UserProfile, "sessionsValidAfter">): void {
  if (!profile.sessionsValidAfter) return;
  const cutoff = Date.parse(profile.sessionsValidAfter);
  if (Number.isFinite(cutoff) && token.auth_time * 1000 < cutoff) throw Errors.unauthenticated(AUTH_MSG.revoked);
}

async function createBootstrapAdmin(token: DecodedIdToken, email: string): Promise<UserProfile> {
  const ref = db().collection(COL.users).doc(token.uid);
  const profile: UserProfile = {
    uid: token.uid,
    email,
    displayName: (typeof token.name === "string" && token.name.trim()) || email.split("@")[0],
    role: "ADMIN",
    levels: [],
    gvcnClasses: [],
    active: true,
    createdAt: nowIso(),
  };
  const batch = db().batch();
  batch.create(ref, profile);
  writeAudit(batch, {
    uid: token.uid,
    email,
    role: "ADMIN",
    action: "CREATE_USER",
    entity: "user",
    entityId: token.uid,
    detail: { bootstrap: true, role: "ADMIN" },
  });
  try {
    await batch.commit();
    return profile;
  } catch {
    // Created concurrently by another request → read the winner.
    const snap = await ref.get();
    if (snap.exists) return snap.data() as UserProfile;
    throw Errors.internal();
  }
}

/** Load (cached) or bootstrap the profile of a verified token. Throws 403 when missing or locked. */
export async function loadProfile(token: DecodedIdToken): Promise<UserProfile> {
  const hit = profileCache.get(token.uid);
  let profile: UserProfile | undefined = hit && hit.expires > Date.now() ? hit.profile : undefined;
  if (!profile) {
    const snap = await db().collection(COL.users).doc(token.uid).get();
    if (snap.exists) {
      profile = snap.data() as UserProfile;
    } else {
      const email = (token.email ?? "").toLowerCase();
      if (!(await bootstrapAllowed(token, email))) throw Errors.forbidden(AUTH_MSG.noProfile);
      profile = await createBootstrapAdmin(token, email);
    }
    primeProfileCache(profile);
  }
  if (!profile.active) throw Errors.forbidden(AUTH_MSG.locked);
  return profile;
}

/** Full request authentication → SessionUser. */
export async function authenticate(req: Request): Promise<SessionUser> {
  const token = await verifyRequestToken(req);
  const profile = await loadProfile(token);
  assertSessionValid(token, profile);
  return { uid: token.uid, email: (profile.email || token.email || "").toLowerCase(), profile };
}

export function accessibleLevels(profile: UserProfile): LevelId[] {
  return LEVEL_IDS.filter((l) => canAccessLevel(profile, l));
}

export function meResponse(profile: UserProfile): MeResponse {
  return { profile, accessibleLevels: accessibleLevels(profile) };
}

/* ------------------------------ authorisation ------------------------------ */

export function requirePermission(user: SessionUser, p: Permission, message?: string): void {
  if (!hasPermission(user.profile, p)) throw Errors.forbidden(message);
}

export function requireAnyPermission(user: SessionUser, ps: readonly Permission[], message?: string): void {
  if (!ps.some((p) => hasPermission(user.profile, p))) throw Errors.forbidden(message);
}

export function requireLevel(user: SessionUser, levelId: LevelId): void {
  if (!canAccessLevel(user.profile, levelId)) throw Errors.forbidden(AUTH_MSG.level);
}

/** Student-level detail of a class (names, notes): all-classes viewers or the GVCN of that class. */
export function requireClassDetail(user: SessionUser, levelId: LevelId, classCode: string): void {
  requireLevel(user, levelId);
  if (!canSeeClassDetail(user.profile, levelId, classCode)) throw Errors.forbidden(AUTH_MSG.classDetail);
}

/** Display name used for createdByName etc. */
export function actorName(user: SessionUser): string {
  return user.profile.displayName || user.email;
}
