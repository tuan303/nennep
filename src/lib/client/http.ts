/**
 * Low-level fetch wrapper for `/api/*` (browser only).
 * - Adds `Authorization: Bearer <Firebase ID token>` (waits for Auth to restore a persisted session first).
 * - On 401 retries once with a force-refreshed token (expired/rotated token). A 401 that survives the refresh means
 *   the server rejects the session itself (revoked after a password reset / re-secured account, invalid…): it is
 *   reported to `onSessionRejected` listeners (the session provider signs the user out).
 * - JSON in/out, `cache: "no-store"`; failures become `ApiClientError` (Vietnamese message).
 */
import {
  ApiClientError,
  BAD_RESPONSE_MESSAGE,
  errorFromResponse,
  isAbortError,
  networkError,
  SESSION_EXPIRED_MESSAGE,
} from "./api-errors";
import { firebaseErrorCode } from "./auth-errors";
import { getClientAuth } from "./firebase-core";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type SessionRejectedListener = (err: ApiClientError) => void;
const sessionRejectedListeners = new Set<SessionRejectedListener>();

/** Called with the error of every server 401 (after the token-refresh retry). Returns the unsubscribe function. */
export function onSessionRejected(listener: SessionRejectedListener): () => void {
  sessionRejectedListeners.add(listener);
  return () => {
    sessionRejectedListeners.delete(listener);
  };
}
export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: HttpMethod;
  query?: Record<string, QueryValue>;
  /** JSON-serialised when defined. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Send the Firebase ID token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

/** "/api/x" + query (undefined/null/"" values are skipped). */
export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

/** Encode a single path segment (ids may contain characters such as "/"). */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

async function idToken(forceRefresh: boolean): Promise<string> {
  const auth = getClientAuth();
  try {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new ApiClientError(401, "UNAUTHENTICATED", SESSION_EXPIRED_MESSAGE);
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (firebaseErrorCode(err) === "auth/network-request-failed") throw networkError(err);
    throw new ApiClientError(401, "UNAUTHENTICATED", SESSION_EXPIRED_MESSAGE);
  }
}

/** Perform the request and return the raw Response (any status). Throws only for network/auth failures. */
export async function send(path: string, opts: RequestOptions = {}): Promise<Response> {
  const withAuth = opts.auth !== false;
  const attempt = async (forceRefresh: boolean): Promise<Response> => {
    const headers = new Headers(opts.headers);
    if (opts.body !== undefined) headers.set("Content-Type", "application/json");
    if (withAuth) headers.set("Authorization", `Bearer ${await idToken(forceRefresh)}`);
    try {
      return await fetch(buildUrl(path, opts.query), {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        cache: "no-store",
        credentials: "same-origin",
        signal: opts.signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw networkError(err);
    }
  };
  const res = await attempt(false);
  if (res.status === 401 && withAuth) {
    await res.body?.cancel().catch(() => undefined);
    return attempt(true);
  }
  return res;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  return JSON.parse(text) as unknown;
}

/** Turn a non-2xx response into an `ApiClientError` (reads the JSON error envelope when present). */
export async function readError(res: Response): Promise<ApiClientError> {
  let body: unknown;
  try {
    body = await readJson(res);
  } catch {
    body = undefined;
  }
  const err = errorFromResponse(res.status, body);
  if (res.status === 401) {
    for (const listener of [...sessionRejectedListeners]) {
      try {
        listener(err);
      } catch {
        // a listener must never hide the original error
      }
    }
  }
  return err;
}

/** JSON request → parsed JSON response typed as `T` (types come from contract.ts; the server is trusted). */
export async function requestJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  if (!res.ok) throw await readError(res);
  let data: unknown;
  try {
    data = await readJson(res);
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiClientError(res.status, "BAD_RESPONSE", BAD_RESPONSE_MESSAGE);
  }
  if (data === undefined) throw new ApiClientError(res.status, "BAD_RESPONSE", BAD_RESPONSE_MESSAGE);
  return data as T;
}

/** Binary GET (e.g. evidence images) with auth. */
export async function requestBlob(path: string, opts: RequestOptions = {}): Promise<Blob> {
  const res = await send(path, opts);
  if (!res.ok) throw await readError(res);
  try {
    return await res.blob();
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw networkError(err);
  }
}
