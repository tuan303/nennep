/**
 * `apiHandler` wraps a Next.js route handler: authentication, permission check, JSON responses and
 * uniform error mapping (ApiError → status, ZodError → 400 VALIDATION, unknown → 500 INTERNAL).
 *
 *   export const POST = apiHandler({ permission: "incident.create" }, async ({ user, req, ip }) => {
 *     const input = await parseBody(req, IncidentCreateSchema);
 *     return created(await doSomething(user, input));          // 201
 *   });
 *   export const GET = apiHandler<{ id: string }>({}, async ({ params }) => getThing(params.id)); // 200 JSON
 */
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodIssue, type ZodTypeAny, type z } from "zod";
import type { ApiErrorBody } from "../contract";
import { zLevelId } from "../contract";
import type { Permission } from "../constants";
import type { LevelId } from "../types";
import { authenticate, requireAnyPermission, requirePermission, type SessionUser } from "./auth";
import { ApiError, Errors, MSG, type ValidationDetail } from "./errors";

export interface ApiContextBase<P> {
  req: NextRequest;
  params: P;
  /** First x-forwarded-for entry (or x-real-ip), "" when unknown. */
  ip: string;
}
export interface ApiContext<P = Record<string, never>> extends ApiContextBase<P> {
  user: SessionUser;
}
export interface PublicApiContext<P = Record<string, never>> extends ApiContextBase<P> {
  user: null;
}

/** Explicit status/body/headers. `{ __status: 201, body }` is what `created()` returns. */
export interface ApiResult {
  __status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** What a handler may return: a plain JSON body (200), an ApiResult, or a raw Response (304, binary…). */
export type HandlerReturn = unknown;

export interface AuthOptions {
  public?: false;
  /** Required permission. */
  permission?: Permission;
  /** At least one of these permissions. */
  anyPermission?: readonly Permission[];
}
export interface PublicOptions {
  public: true;
}

export type RouteContext<P> = { params: Promise<P> };
export type RouteHandler<P> = (req: NextRequest, context: RouteContext<P>) => Promise<Response>;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function created(body: unknown, headers?: Record<string, string>): ApiResult {
  return { __status: 201, body, headers };
}

export function withStatus(status: number, body: unknown, headers?: Record<string, string>): ApiResult {
  return { __status: status, body, headers };
}

function isApiResult(v: unknown): v is ApiResult {
  return typeof v === "object" && v !== null && "__status" in v && typeof (v as { __status: unknown }).__status === "number";
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

/** JSON response with `Cache-Control: no-store` unless overridden. */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

const ASCII_ONLY = /^[\x00-\x7F]*$/;

/** Vietnamese message for a zod issue (custom schema messages are kept as-is). */
export function zodIssueMessage(issue: ZodIssue): string {
  const field = issue.path.length ? `"${issue.path.join(".")}"` : "dữ liệu";
  if (!ASCII_ONLY.test(issue.message)) return issue.message;
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" ? `Thiếu trường ${field}.` : `Trường ${field} sai kiểu dữ liệu.`;
    case "invalid_enum_value":
    case "invalid_literal":
    case "invalid_union":
      return `Giá trị của ${field} không hợp lệ.`;
    case "too_small":
      return `Giá trị của ${field} quá nhỏ hoặc quá ngắn.`;
    case "too_big":
      return `Giá trị của ${field} quá lớn hoặc quá dài.`;
    case "invalid_string":
      return `Định dạng của ${field} không hợp lệ.`;
    case "unrecognized_keys":
      return `Có trường không được hỗ trợ trong ${field}.`;
    default:
      return `Giá trị của ${field} không hợp lệ.`;
  }
}

export function zodToApiError(err: ZodError): ApiError {
  const details: ValidationDetail[] = err.issues.map((i) => ({ path: i.path.join("."), message: zodIssueMessage(i) }));
  const messages = [...new Set(details.map((d) => d.message))];
  return Errors.validation(messages.slice(0, 5).join(" ") || MSG.validation, details);
}

function firestoreAborted(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === 10;
}

/** Map any thrown value to an error Response (logs unexpected errors). */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    if (e.status >= 500) console.error("[api] server error:", e.message, e.details ?? "");
    return jsonResponse(e.toBody(), e.status, e.headers ?? {});
  }
  if (e instanceof ZodError) {
    const err = zodToApiError(e);
    return jsonResponse(err.toBody(), err.status);
  }
  if (firestoreAborted(e)) {
    const err = Errors.conflict("Hệ thống đang bận vì nhiều người cùng ghi dữ liệu. Vui lòng thử lại.");
    return jsonResponse(err.toBody(), err.status);
  }
  console.error("[api] unexpected error:", e);
  const body: ApiErrorBody = { error: { code: "INTERNAL", message: MSG.internal } };
  return jsonResponse(body, 500);
}

function toResponse(result: HandlerReturn): Response {
  if (result instanceof Response) return result;
  if (isApiResult(result)) {
    if (result.body === undefined || result.body === null) return new NextResponse(null, { status: result.__status, headers: { ...NO_STORE, ...result.headers } });
    return jsonResponse(result.body, result.__status, result.headers);
  }
  if (result === undefined) return new NextResponse(null, { status: 204, headers: NO_STORE });
  return jsonResponse(result);
}

export function apiHandler<P = Record<string, never>>(opts: PublicOptions, fn: (ctx: PublicApiContext<P>) => Promise<HandlerReturn>): RouteHandler<P>;
export function apiHandler<P = Record<string, never>>(opts: AuthOptions, fn: (ctx: ApiContext<P>) => Promise<HandlerReturn>): RouteHandler<P>;
export function apiHandler<P>(
  opts: PublicOptions | AuthOptions,
  fn: ((ctx: PublicApiContext<P>) => Promise<HandlerReturn>) | ((ctx: ApiContext<P>) => Promise<HandlerReturn>),
): RouteHandler<P> {
  return async (req, context) => {
    try {
      const params = ((await context?.params) ?? {}) as P;
      const ip = clientIp(req);
      if (opts.public) {
        return toResponse(await (fn as (ctx: PublicApiContext<P>) => Promise<HandlerReturn>)({ req, params, ip, user: null }));
      }
      const user = await authenticate(req);
      if (opts.permission) requirePermission(user, opts.permission);
      if (opts.anyPermission?.length) requireAnyPermission(user, opts.anyPermission);
      return toResponse(await (fn as (ctx: ApiContext<P>) => Promise<HandlerReturn>)({ req, params, ip, user }));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Parse + validate a JSON body (empty body → {}). Invalid JSON / schema → 400 VALIDATION. */
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S, opts: { maxBytes?: number } = {}): Promise<z.output<S>> {
  const maxBytes = opts.maxBytes ?? 4_500_000;
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new ApiError(413, "VALIDATION", "Dữ liệu gửi lên quá lớn.");
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw Errors.validation("Dữ liệu gửi lên không đúng định dạng JSON.");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw zodToApiError(parsed.error);
  return parsed.data as z.output<S>;
}

/** Validate query parameters (`?a=1&b=x` → { a: "1", b: "x" }) with a zod schema. */
export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw zodToApiError(parsed.error);
  return parsed.data as z.output<S>;
}

/** Required `?level=` (or another param name) as a LevelId; 400 otherwise. */
export function levelParam(req: Request, name = "level"): LevelId {
  const raw = new URL(req.url).searchParams.get(name);
  const parsed = zLevelId.safeParse(raw ?? "");
  if (!parsed.success) throw Errors.validation(`Cấp học không hợp lệ (tham số "${name}" phải là TH, THCS hoặc THPT).`);
  return parsed.data;
}

/** Boolean query flag: "1" | "true" | "yes". */
export function flagParam(req: Request, name: string): boolean {
  const v = new URL(req.url).searchParams.get(name);
  return v === "1" || v === "true" || v === "yes";
}
