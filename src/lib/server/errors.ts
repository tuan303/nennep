/**
 * Typed API errors. Throw them anywhere inside a route/service; `apiHandler` maps them to
 * `ApiErrorBody` JSON with the right HTTP status. Messages are Vietnamese and safe to show to users.
 */
import type { ApiErrorBody } from "../contract";

export type ApiErrorCode = ApiErrorBody["error"]["code"];

export interface ValidationDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  /** String code (never numeric, so Firestore never treats it as a retryable transaction error). */
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  /** Extra response headers (e.g. Retry-After). */
  readonly headers?: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown, headers?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { error: { code: this.code, message: this.message } };
    if (this.details !== undefined) body.error.details = this.details;
    return body;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export const MSG = {
  unauthenticated: "Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  forbidden: "Bạn không có quyền thực hiện thao tác này.",
  notFound: "Không tìm thấy dữ liệu yêu cầu.",
  validation: "Dữ liệu không hợp lệ.",
  conflict: "Dữ liệu vừa được người khác cập nhật. Vui lòng tải lại và thử lại.",
  rateLimited: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  internal: "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.",
} as const;

export const Errors = {
  unauthenticated: (message: string = MSG.unauthenticated) => new ApiError(401, "UNAUTHENTICATED", message),
  forbidden: (message: string = MSG.forbidden) => new ApiError(403, "FORBIDDEN", message),
  notFound: (message: string = MSG.notFound) => new ApiError(404, "NOT_FOUND", message),
  validation: (message: string = MSG.validation, details?: ValidationDetail[] | unknown) =>
    new ApiError(400, "VALIDATION", message, details),
  /** Several rule messages → one 400 whose message joins them and whose details list them. */
  validationList: (messages: string[], path = "") =>
    new ApiError(
      400,
      "VALIDATION",
      messages.join(" "),
      messages.map((message): ValidationDetail => ({ path, message })),
    ),
  conflict: (message: string = MSG.conflict, details?: unknown) => new ApiError(409, "CONFLICT", message, details),
  rateLimited: (retryAfterSec?: number, message: string = MSG.rateLimited) =>
    new ApiError(
      429,
      "RATE_LIMITED",
      message,
      undefined,
      retryAfterSec !== undefined ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSec))) } : undefined,
    ),
  internal: (message: string = MSG.internal) => new ApiError(500, "INTERNAL", message),
} as const;
