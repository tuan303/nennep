/**
 * Client-side error model for API calls (pure – no Firebase/React imports, unit-tested).
 *
 * Every failed `api.*` call rejects with an `ApiClientError` whose `message` is Vietnamese and safe to show:
 * - the server's `ApiErrorBody.error.message` when the response carries one;
 * - otherwise a friendly fallback chosen from the HTTP status;
 * - status 0 + code "NETWORK" when the server could not be reached.
 * Aborted requests (AbortController) are re-thrown untouched – check with `isAbortError`.
 */
import type { ApiErrorBody } from "@/lib/contract";

export type ServerErrorCode = ApiErrorBody["error"]["code"];
/** Codes produced by the client in addition to the server's codes. */
export type ApiClientErrorCode = ServerErrorCode | "NETWORK" | "BAD_RESPONSE";

export const NETWORK_ERROR_MESSAGE = "Không kết nối được máy chủ. Vui lòng thử lại.";
export const GENERIC_ERROR_MESSAGE = "Đã có lỗi xảy ra. Vui lòng thử lại.";
export const SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
export const BAD_RESPONSE_MESSAGE = "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.";

const SERVER_CODES: ReadonlySet<string> = new Set<ServerErrorCode>([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL",
]);

/** Base class for errors whose `message` is Vietnamese and may be shown to users as is. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class ApiClientError extends UserFacingError {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True when `v` has the documented error envelope `{ error: { code, message, details? } }`. */
export function isApiErrorBody(v: unknown): v is ApiErrorBody {
  if (!isRecord(v) || !isRecord(v.error)) return false;
  return typeof v.error.code === "string" && typeof v.error.message === "string";
}

export function codeForStatus(status: number): ApiClientErrorCode {
  if (status === 0) return "NETWORK";
  if (status === 400 || status === 413 || status === 422) return "VALIDATION";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409 || status === 412) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL";
}

export function fallbackMessageForStatus(status: number): string {
  switch (status) {
    case 0:
      return NETWORK_ERROR_MESSAGE;
    case 400:
    case 422:
      return "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.";
    case 401:
      return SESSION_EXPIRED_MESSAGE;
    case 403:
      return "Bạn không có quyền thực hiện thao tác này.";
    case 404:
      return "Không tìm thấy dữ liệu yêu cầu.";
    case 409:
    case 412:
      return "Dữ liệu vừa được người khác thay đổi. Vui lòng tải lại và thử lại.";
    case 413:
      return "Dữ liệu gửi lên quá lớn. Vui lòng chia nhỏ và thử lại.";
    case 429:
      return "Bạn thao tác quá nhanh. Vui lòng chờ ít phút rồi thử lại.";
    case 502:
    case 503:
      return "Máy chủ đang bận. Vui lòng thử lại sau ít phút.";
    case 504:
      return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
    default:
      return status >= 500 ? "Máy chủ đang gặp sự cố. Vui lòng thử lại sau." : GENERIC_ERROR_MESSAGE;
  }
}

/** Build the error for a non-2xx response from its status and (already parsed, possibly undefined) body. */
export function errorFromResponse(status: number, body: unknown): ApiClientError {
  if (isApiErrorBody(body)) {
    const { code, message, details } = body.error;
    const safeCode = SERVER_CODES.has(code) ? code : codeForStatus(status);
    const safeMessage = message.trim() || fallbackMessageForStatus(status);
    return new ApiClientError(status, safeCode, safeMessage, details);
  }
  return new ApiClientError(status, codeForStatus(status), fallbackMessageForStatus(status));
}

/** The server could not be reached (offline, DNS, CORS, connection reset…). */
export function networkError(cause?: unknown): ApiClientError {
  return new ApiClientError(0, "NETWORK", NETWORK_ERROR_MESSAGE, cause === undefined ? undefined : { cause: String(cause) });
}

export function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}

export function isApiClientError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

/** Message to show in a toast / inline error for any thrown value. Unknown errors → `fallback`. */
export function errorMessage(err: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string {
  if (err instanceof UserFacingError && err.message) return err.message;
  return fallback;
}

export interface ValidationIssue {
  path: string; // "studentIds.0", "" for form-level
  message: string;
}

/** Validation issues carried by a 400 response (`details: Array<{ path, message }>`); [] otherwise. */
export function validationIssues(err: unknown): ValidationIssue[] {
  if (!(err instanceof ApiClientError) || !Array.isArray(err.details)) return [];
  const out: ValidationIssue[] = [];
  for (const item of err.details) {
    if (!isRecord(item) || typeof item.message !== "string") continue;
    const p = item.path;
    const path = Array.isArray(p) ? p.map(String).join(".") : typeof p === "string" ? p : "";
    out.push({ path, message: item.message });
  }
  return out;
}

/** First validation message per top-level field, e.g. `{ classCode: "Thiếu lớp" }`. Form-level issues use key "". */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of validationIssues(err)) {
    const key = issue.path.split(".")[0] ?? "";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
