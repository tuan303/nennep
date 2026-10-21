/** Session lifecycle events (LOGIN / LOGOUT / LOGIN_FAILED) with audit. */
import type { MeResponse } from "../contract";
import { compactDate, todayVN } from "../engine/dates";
import { COL } from "../firestore-paths";
import type { UserProfile } from "../types";
import { auditOf, writeAudit, writeAuditDirect } from "./audit";
import { meResponse, primeProfileCache, type SessionUser } from "./auth";
import { db, nowIso } from "./firebase-admin";

/** POST /api/auth/session: set lastLoginAt + audit LOGIN atomically; returns MeResponse. */
export async function recordLogin(user: SessionUser, ip?: string): Promise<MeResponse> {
  const lastLoginAt = nowIso();
  const batch = db().batch();
  batch.update(db().collection(COL.users).doc(user.uid), { lastLoginAt });
  writeAudit(batch, {
    ...auditOf(user, "LOGIN", { entity: "user", entityId: user.uid, ip }),
    ts: lastLoginAt,
  });
  await batch.commit();
  const profile: UserProfile = { ...user.profile, lastLoginAt };
  primeProfileCache(profile);
  return meResponse(profile);
}

/** POST /api/auth/logout: audit LOGOUT. */
export async function recordLogout(user: SessionUser, ip?: string): Promise<void> {
  await writeAuditDirect(auditOf(user, "LOGOUT", { entity: "user", entityId: user.uid, ip }));
}

/* ------------------------------- LOGIN_FAILED ------------------------------- */
/*
 * The endpoint is anonymous, so every stored entry is a Firestore write anyone can trigger. On the free plan the
 * daily write quota is shared with incident entry, so the number of stored LOGIN_FAILED entries is bounded:
 *  - only syntactically valid e-mails are stored, the reason is reduced to a known Firebase error code;
 *  - per server instance, one entry per e-mail per LOGIN_FAILED_DEDUP_MS (further attempts are only logged);
 *  - school-wide, at most LOGIN_FAILED_DAILY_CAP entries per VN day (Firestore counter, all instances); the entry
 *    that reaches the cap says so (`detail.dailyCapReached`) and later attempts are only logged to the console.
 * Firebase Auth itself throttles password guessing (auth/too-many-requests); this log is for the admins' review.
 */

export const LOGIN_FAILED_DAILY_CAP = 300;
export const LOGIN_FAILED_DEDUP_MS = 10 * 60_000;
const DEDUP_MAX_KEYS = 5_000;

/** Firebase Auth error codes the client reports (anything else is stored as "other"). */
export const LOGIN_FAILED_REASONS: ReadonlySet<string> = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/invalid-password",
  "auth/too-many-requests",
  "auth/user-disabled",
]);

const LOGIN_EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const lastStored = new Map<string, number>();
let capReachedDay = "";

/** Tests only: forget the per-instance dedup state and the "cap reached" flag. */
export function resetLoginFailedState(): void {
  lastStored.clear();
  capReachedDay = "";
}

export type LoginFailedOutcome = "recorded" | "invalid-email" | "duplicate" | "daily-cap" | "error";

function rememberStored(email: string, now: number): void {
  lastStored.delete(email);
  lastStored.set(email, now);
  for (const key of lastStored.keys()) {
    if (lastStored.size <= DEDUP_MAX_KEYS) break;
    lastStored.delete(key);
  }
}

/** POST /api/auth/login-failed (anonymous): audit LOGIN_FAILED with the attempted email, within the bounds above. */
export async function recordLoginFailed(email: string, reason: string | undefined, ip: string, now: number = Date.now()): Promise<LoginFailedOutcome> {
  const address = email.trim().toLowerCase();
  if (address.length > 200 || !LOGIN_EMAIL_RE.test(address)) return "invalid-email";
  const code = reason ? (LOGIN_FAILED_REASONS.has(reason) ? reason : "other") : undefined;
  const day = todayVN(new Date(now));
  const previous = lastStored.get(address);
  if (previous !== undefined && previous > now - LOGIN_FAILED_DEDUP_MS) {
    console.info(`[login-failed] ${address} ${code ?? ""} ${ip} (đã ghi trong ${LOGIN_FAILED_DEDUP_MS / 60_000} phút qua)`);
    return "duplicate";
  }
  if (capReachedDay === day) {
    console.warn(`[login-failed] ${address} ${code ?? ""} ${ip} (đã đạt giới hạn ${LOGIN_FAILED_DAILY_CAP} bản ghi/ngày)`);
    return "daily-cap";
  }
  rememberStored(address, now);
  const counterRef = db()
    .collection(COL.counters)
    .doc(`LOGIN_FAILED_${compactDate(day)}`);
  let stored: boolean;
  try {
    stored = await db().runTransaction(
      async (tx) => {
        const snap = await tx.get(counterRef);
        const count: unknown = snap.get("count");
        const n = typeof count === "number" ? count : 0;
        if (n >= LOGIN_FAILED_DAILY_CAP) return false;
        tx.set(counterRef, { count: n + 1, updatedAt: nowIso() });
        const detail: Record<string, unknown> = {};
        if (code) detail.reason = code;
        if (n + 1 === LOGIN_FAILED_DAILY_CAP) detail.dailyCapReached = true;
        writeAudit(tx, {
          uid: "",
          email: address,
          role: "",
          action: "LOGIN_FAILED",
          entity: "user",
          detail,
          ip: ip || undefined,
        });
        return true;
      },
      { maxAttempts: 5 },
    );
  } catch (e) {
    // Reporting a failed sign-in must never fail the client (contention on the counter, quota…): log only.
    console.warn(`[login-failed] ${address} ${code ?? ""} ${ip} (không ghi được nhật ký)`, e);
    return "error";
  }
  if (!stored) {
    capReachedDay = day;
    console.warn(`[login-failed] ${address} ${code ?? ""} ${ip} (đã đạt giới hạn ${LOGIN_FAILED_DAILY_CAP} bản ghi/ngày)`);
    return "daily-cap";
  }
  return "recorded";
}
