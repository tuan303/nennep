"use client";
/**
 * Authentication session: <SessionProvider> (wrap the whole app, outside <DataProvider>) + useSession().
 *
 * Flow: Firebase onIdTokenChanged → when a NEW user appears (not on token refresh):
 *   - interactive sign-in (login / loginWithProvider)  → POST /api/auth/session (audits LOGIN)
 *   - restored session (page reload)                   → GET /api/me (falls back to POST /api/auth/session on 403,
 *                                                         so bootstrap admins still get their profile created)
 * Result: status "signedIn" + profile, or "forbidden" (403, `error` holds the server message).
 * Network/5xx errors keep status "loading" with `error` set and retry automatically (backoff, and when back online).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  onIdTokenChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";
import { LEVEL_IDS, canAccessLevel, canSeeClassDetail, hasPermission, type Permission } from "@/lib/constants";
import type { MeResponse } from "@/lib/contract";
import type { LevelId, UserProfile } from "@/lib/types";
import { api } from "./api";
import { ApiClientError, errorMessage } from "./api-errors";
import {
  SessionError,
  authErrorMessage,
  firebaseErrorCode,
  shouldReportLoginFailure,
  toSessionError,
  validateNewPassword,
} from "./auth-errors";
import { clearEvidenceCache } from "./evidence";
import { getClientAuth } from "./firebase-core";
import { onSessionRejected } from "./http";

export { SessionError, isSilentAuthError, validateNewPassword } from "./auth-errors";

export type SessionStatus = "loading" | "signedOut" | "signedIn" | "forbidden";
export type AuthProviderId = "google" | "microsoft";

export interface SessionValue {
  status: SessionStatus;
  profile?: UserProfile;
  /** Levels the user may open ([] unless signedIn). */
  accessibleLevels: LevelId[];
  /** Email of the Firebase account (also set while "loading"/"forbidden"). */
  email?: string;
  /**
   * Vietnamese message: reason when "forbidden"; last profile-loading error while "loading" (auto-retrying);
   * or why the user was signed out (e.g. expired session) when "signedOut".
   */
  error?: string;
  /** Throws `SessionError` (Vietnamese `message`). Resolves once Firebase sign-in succeeded; watch `status` for the profile. */
  login(email: string, password: string): Promise<void>;
  /** Popup sign-in; throws `SessionError` (use `isSilentAuthError(err)` to ignore "popup closed"). */
  loginWithProvider(provider: AuthProviderId): Promise<void>;
  logout(): Promise<void>;
  /** Re-authenticates with `current`, then sets `next`. Throws `SessionError`. */
  changePassword(current: string, next: string): Promise<void>;
  can(p: Permission): boolean;
  canSeeClass(levelId: LevelId, classCode: string): boolean;
  /** Re-fetch the profile silently (GET /api/me), e.g. after editing the current user's own account. */
  reloadProfile(): Promise<void>;
}

interface SessionState {
  status: SessionStatus;
  profile?: UserProfile;
  accessibleLevels: LevelId[];
  email?: string;
  error?: string;
}

type LoadMode = "session" | "me";

const FORBIDDEN_FALLBACK = "Tài khoản chưa được cấp quyền. Vui lòng liên hệ quản trị viên.";
const PROFILE_RETRY_MESSAGE = "Không tải được thông tin tài khoản. Đang thử lại…";
const NOT_CONFIGURED_MESSAGE = "Chưa cấu hình kết nối đăng nhập. Vui lòng liên hệ quản trị viên.";

const SessionContext = createContext<SessionValue | null>(null);

function levelsOf(res: MeResponse): LevelId[] {
  if (Array.isArray(res.accessibleLevels)) return res.accessibleLevels;
  return LEVEL_IDS.filter((l) => canAccessLevel(res.profile, l));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading", accessibleLevels: [] });
  const uidRef = useRef<string | null>(null); // user whose profile is loaded / being loaded
  const interactiveRef = useRef(false); // the next new user comes from login()/loginWithProvider()
  const seqRef = useRef(0); // invalidates stale profile loads
  const retryRef = useRef<{ timer: number; run: () => void } | null>(null);

  const cancelRetry = useCallback(() => {
    if (retryRef.current) window.clearTimeout(retryRef.current.timer);
    retryRef.current = null;
  }, []);

  const loadProfile = useCallback(
    async (user: User, mode: LoadMode, opts: { attempt?: number; silent?: boolean } = {}): Promise<void> => {
      const attempt = opts.attempt ?? 0;
      const seq = ++seqRef.current;
      cancelRetry();
      const email = user.email ?? undefined;
      if (!opts.silent) {
        setState((s) => ({ status: "loading", accessibleLevels: [], email, error: attempt > 0 ? s.error : undefined }));
      }
      const isCurrent = () => seq === seqRef.current && uidRef.current === user.uid;
      try {
        let res: MeResponse;
        try {
          res = mode === "session" ? await api.session() : await api.me();
        } catch (err) {
          // The profile may be created on the first session call (bootstrap admins) – try once.
          if (mode === "me" && err instanceof ApiClientError && err.status === 403) res = await api.session();
          else throw err;
        }
        if (!isCurrent()) return;
        setState({ status: "signedIn", profile: res.profile, accessibleLevels: levelsOf(res), email: email ?? res.profile.email });
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof ApiClientError && err.status === 403) {
          setState({ status: "forbidden", accessibleLevels: [], email, error: err.message || FORBIDDEN_FALLBACK });
          return;
        }
        if (err instanceof ApiClientError && err.status === 401) {
          uidRef.current = null;
          await signOut(getClientAuth()).catch(() => undefined);
          setState({ status: "signedOut", accessibleLevels: [], error: err.message });
          return;
        }
        if (opts.silent) return; // keep the current profile on a failed background reload
        const delay = Math.min(30_000, 2_000 * 2 ** attempt);
        setState((s) => ({ ...s, status: "loading", error: errorMessage(err, PROFILE_RETRY_MESSAGE) }));
        const run = () => void loadProfile(user, mode, { attempt: attempt + 1 });
        retryRef.current = { timer: window.setTimeout(run, delay), run };
      }
    },
    [cancelRetry],
  );

  // Firebase auth listener: one profile load per signed-in user, ignoring token refreshes.
  useEffect(() => {
    let auth: ReturnType<typeof getClientAuth>;
    try {
      auth = getClientAuth();
    } catch (err) {
      console.error(err);
      setState({ status: "signedOut", accessibleLevels: [], error: NOT_CONFIGURED_MESSAGE });
      return;
    }
    return onIdTokenChanged(auth, (user) => {
      if (!user) {
        uidRef.current = null;
        seqRef.current++;
        cancelRetry();
        setState((s) => ({ status: "signedOut", accessibleLevels: [], error: s.status === "signedOut" ? s.error : undefined }));
        return;
      }
      if (uidRef.current === user.uid) return; // token refresh / re-authentication
      uidRef.current = user.uid;
      const mode: LoadMode = interactiveRef.current ? "session" : "me";
      interactiveRef.current = false;
      void loadProfile(user, mode);
    });
  }, [loadProfile, cancelRetry]);

  // The server rejected the session itself on some request (401 even after a token refresh – e.g. revoked by a password
  // reset or an account re-secured by the admin): sign out with the server's message instead of failing call by call.
  useEffect(
    () =>
      onSessionRejected((err) => {
        if (!uidRef.current) return; // already signed out (a profile load still in flight then sees it is stale)
        uidRef.current = null;
        seqRef.current++;
        cancelRetry();
        setState({ status: "signedOut", accessibleLevels: [], error: err.message });
        clearEvidenceCache();
        void signOut(getClientAuth()).catch(() => undefined);
      }),
    [cancelRetry],
  );

  // Retry immediately when the browser comes back online.
  useEffect(() => {
    const onOnline = () => retryRef.current?.run();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  /** After an interactive sign-in: start the session if the auth listener did not (same account signed in again). */
  const finishInteractive = useCallback(
    (user: User) => {
      if (!interactiveRef.current) return;
      interactiveRef.current = false;
      uidRef.current = user.uid;
      void loadProfile(user, "session");
    },
    [loadProfile],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const e = email.trim();
      if (!e) throw new SessionError("auth/missing-email", "Vui lòng nhập email.");
      if (!password) throw new SessionError("auth/missing-password", authErrorMessage("auth/missing-password"));
      interactiveRef.current = true;
      try {
        const cred = await signInWithEmailAndPassword(getClientAuth(), e, password);
        finishInteractive(cred.user);
      } catch (err) {
        interactiveRef.current = false;
        const code = firebaseErrorCode(err);
        if (shouldReportLoginFailure(code)) void api.loginFailed(e.toLowerCase(), code).catch(() => undefined);
        throw toSessionError(err, "login");
      }
    },
    [finishInteractive],
  );

  const loginWithProvider = useCallback(
    async (provider: AuthProviderId) => {
      const p = provider === "google" ? new GoogleAuthProvider() : new OAuthProvider("microsoft.com");
      p.setCustomParameters({ prompt: "select_account" });
      interactiveRef.current = true;
      try {
        const cred = await signInWithPopup(getClientAuth(), p);
        finishInteractive(cred.user);
      } catch (err) {
        interactiveRef.current = false;
        throw toSessionError(err, "provider");
      }
    },
    [finishInteractive],
  );

  const logout = useCallback(async () => {
    const auth = getClientAuth();
    if (auth.currentUser) await api.logout().catch(() => undefined); // best-effort audit (LOGOUT)
    clearEvidenceCache();
    await signOut(auth);
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const user = getClientAuth().currentUser;
    if (!user) throw new SessionError("auth/not-signed-in", authErrorMessage("auth/not-signed-in", "changePassword"));
    if (!user.email || !user.providerData.some((pd) => pd.providerId === "password")) {
      throw new SessionError("auth/no-password-provider", authErrorMessage("auth/no-password-provider", "changePassword"));
    }
    const invalid = validateNewPassword(current, next);
    if (invalid) throw new SessionError("auth/invalid-new-password", invalid);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
    } catch (err) {
      throw toSessionError(err, "changePassword");
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    const user = getClientAuth().currentUser;
    if (user && uidRef.current === user.uid) await loadProfile(user, "me", { silent: true });
  }, [loadProfile]);

  const { profile } = state;
  const can = useCallback((p: Permission) => hasPermission(profile, p), [profile]);
  const canSeeClass = useCallback((levelId: LevelId, classCode: string) => canSeeClassDetail(profile, levelId, classCode), [profile]);

  const value = useMemo<SessionValue>(
    () => ({ ...state, login, loginWithProvider, logout, changePassword, can, canSeeClass, reloadProfile }),
    [state, login, loginWithProvider, logout, changePassword, can, canSeeClass, reloadProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() must be used inside <SessionProvider>.");
  return ctx;
}
