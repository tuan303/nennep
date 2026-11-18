/**
 * Microsoft Graph transport (Microsoft 365, one sending mailbox – shared or licensed user):
 * - app-only token: client credentials at https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token with scope
 *   https://graph.microsoft.com/.default, cached until 60 s before it expires (one request at a time);
 * - POST https://graph.microsoft.com/v1.0/users/{MAIL_SENDER}/sendMail: HTML body, to/cc, base64 file attachments,
 *   from = the mailbox with MAIL_SENDER_NAME, saveToSentItems, auto-replies suppressed.
 * Errors become MailSendError with a Vietnamese message: 408 / 429 / 5xx / network → retryable (Retry-After honoured);
 * 400 / 401 / 403 / 404 / 413 → not retryable, with a hint for the IT admin. A 401 from sendMail retries once with a
 * fresh token. A 403 drops the cached token (when it is still the one that was refused): the Mail.Send application
 * permission is part of the token, so a permission granted in Microsoft Entra after the token was issued only shows
 * with a new one – the next send gets it instead of waiting up to an hour for the old token to expire.
 * Requests above GRAPH_MAX_REQUEST_BYTES are refused – callers drop the attachment first.
 * Each sendMail request times out after 30 s, or earlier so that it ends GRAPH_DEADLINE_MARGIN_MS before the caller's
 * deadline (SendOptions.deadline). A sendMail request is never started with less than graphMinSendMs (10 s, up to
 * 13 s for the largest requests) left – also not the one after the fresh-token retry of a 401: a request cut off by
 * its timeout after Microsoft 365 accepted the message would count as a retryable failure and the message would go out
 * twice. Instead OutOfTimeError is thrown: nothing was sent, so the drain puts the job back without counting the
 * attempt (a synchronous test send is FAILED with the out-of-time message).
 * The token request is shared by every concurrent caller of the instance and always gets the full 30 s, whatever the
 * deadline of the caller that started it; each caller only waits for it within its own budget minus the minimum of
 * its send (OutOfTimeError when that ends first – the request goes on for the others; none is started or waited for
 * with less than GRAPH_MIN_REQUEST_MS of that budget).
 */
import { MailSendError, OutOfTimeError, type GraphTransportConfig, type MailTransport, type OutgoingMail, type SendOptions } from "./types";

export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
/** Callers send without the attachment above this request size (Graph rejects sendMail JSON requests over 4 MB). */
export const GRAPH_MAX_REQUEST_BYTES = 3_500_000;
const TOKEN_EARLY_REFRESH_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Kept free before the caller's deadline (the drain still records the outcome). */
export const GRAPH_DEADLINE_MARGIN_MS = 2_000;
/**
 * No token request is started – nor joined – with less time than this to wait for it: what is left before the deadline
 * minus the margin and the minimum of the send (graphMinSendMs).
 */
export const GRAPH_MIN_REQUEST_MS = 1_000;
/** No sendMail request is started with less time than this before the deadline (minus the margin)… */
export const GRAPH_MIN_SEND_MS = 10_000;
/** … plus up to this much more for big requests, in proportion to their size (the full amount at GRAPH_MAX_REQUEST_BYTES). */
export const GRAPH_MIN_SEND_SIZE_MS = 3_000;
const DETAIL_MAX = 300;

/**
 * Minimum time for a sendMail request of `requestBytes` (pure): GRAPH_MIN_SEND_MS, plus a share of
 * GRAPH_MIN_SEND_SIZE_MS for uploading and processing a big attachment (a ~3 MB report PDF).
 */
export function graphMinSendMs(requestBytes: number): number {
  const share = Math.min(Math.max(requestBytes, 0), GRAPH_MAX_REQUEST_BYTES) / GRAPH_MAX_REQUEST_BYTES;
  return GRAPH_MIN_SEND_MS + Math.round(GRAPH_MIN_SEND_SIZE_MS * share);
}

export function graphTokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

/** "@" stays literal (allowed in a path segment, the form Graph documents for a user principal name). */
export function graphSendMailUrl(sender: string): string {
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender).replace(/%40/g, "@")}/sendMail`;
}

export const GRAPH_MSG = {
  credentials: (code?: string) => `Sai Tenant ID / Client ID / Client secret hoặc secret đã hết hạn${code ? ` (${code})` : ""}.`,
  accessDenied: (sender: string) =>
    `Ứng dụng chưa được cấp quyền gửi thư từ hộp thư ${sender} (cấp trong Microsoft Entra: quyền Mail.Send loại Application đã bấm Grant admin consent và – nếu có giới hạn theo nhóm hộp thư – hộp thư này nằm trong nhóm; cấp bằng RBAC for Applications: vai trò "Application Mail.Send" trên hộp thư này, có hiệu lực sau 30 phút – 2 giờ, khi đó không cấp thêm Mail.Send trong Entra).`,
  mailboxNotFound: (sender: string) => `Không tìm thấy hộp thư gửi ${sender} (kiểm tra MAIL_SENDER, hộp thư có trong Exchange admin center và – nếu là hộp thư người dùng – còn giấy phép Exchange Online).`,
  invalidRecipients: "Microsoft 365 từ chối thư vì có địa chỉ người nhận không hợp lệ.",
  tooLarge: "Thư quá lớn để gửi qua Microsoft 365 (tối đa khoảng 3,5 MB).",
  busy: (status: number) => `Microsoft 365 tạm thời chưa nhận thư (HTTP ${status}) – hệ thống sẽ tự gửi lại.`,
  tokenBusy: (status: number) => `Máy chủ đăng nhập Microsoft tạm thời không phản hồi (HTTP ${status}) – hệ thống sẽ tự gửi lại.`,
  badToken: "Phản hồi đăng nhập của Microsoft không hợp lệ – hệ thống sẽ tự gửi lại.",
  network: (detail: string) => `Không kết nối được tới Microsoft 365${detail ? ` (${detail})` : ""} – hệ thống sẽ tự gửi lại.`,
  rejected: (status: number, code: string, message: string) => `Microsoft 365 từ chối thư (HTTP ${status}${code ? `, ${code}` : ""})${message ? `: ${message}` : ""}.`,
} as const;

interface GraphAddress {
  emailAddress: { address: string; name?: string };
}

export interface GraphFileAttachment {
  "@odata.type": "#microsoft.graph.fileAttachment";
  name: string;
  contentType: string;
  contentBytes: string;
}

export interface GraphSendMailBody {
  message: {
    subject: string;
    body: { contentType: "HTML"; content: string };
    from: GraphAddress;
    toRecipients: GraphAddress[];
    ccRecipients: GraphAddress[];
    attachments?: GraphFileAttachment[];
    internetMessageHeaders: Array<{ name: string; value: string }>;
  };
  saveToSentItems: true;
}

const address = (a: string): GraphAddress => ({ emailAddress: { address: a } });

/** JSON body of sendMail (pure). */
export function graphSendMailBody(mail: OutgoingMail, from: Pick<GraphTransportConfig, "sender" | "senderName">): GraphSendMailBody {
  const message: GraphSendMailBody["message"] = {
    subject: mail.subject,
    body: { contentType: "HTML", content: mail.html },
    from: { emailAddress: { address: from.sender, name: from.senderName } },
    toRecipients: mail.to.map(address),
    ccRecipients: mail.cc.map(address),
    // Exchange: no out-of-office / delivery auto-replies to an automatic mailbox.
    internetMessageHeaders: [{ name: "X-Auto-Response-Suppress", value: "All" }],
  };
  if (mail.attachments && mail.attachments.length > 0) {
    message.attachments = mail.attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBase64,
    }));
  }
  return { message, saveToSentItems: true };
}

/** Size in bytes of the sendMail request of `mail` (compare with GRAPH_MAX_REQUEST_BYTES before adding a big attachment). */
export function graphRequestBytes(mail: OutgoingMail, from: Pick<GraphTransportConfig, "sender" | "senderName"> = { sender: "", senderName: "" }): number {
  return Buffer.byteLength(JSON.stringify(graphSendMailBody(mail, from)), "utf8");
}

/** Retry-After header (delay in seconds or an HTTP date) → ms; undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const short = (s: string) => (s.length > DETAIL_MAX ? `${s.slice(0, DETAIL_MAX - 1)}…` : s);

/** `{ error: { code, message } }` of a Graph error response ("" when absent). */
function graphError(body: unknown): { code: string; message: string } {
  const err = isRecord(body) ? body.error : undefined;
  if (!isRecord(err)) return { code: "", message: "" };
  return { code: typeof err.code === "string" ? err.code : "", message: typeof err.message === "string" ? short(err.message) : "" };
}

const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;

/** Error of the token endpoint (pure). AADSTS codes are kept as a hint (no secret is ever part of the response). */
export function tokenError(status: number, body: unknown, retryAfterMs?: number): MailSendError {
  if (isTransient(status)) return new MailSendError(GRAPH_MSG.tokenBusy(status), true, retryAfterMs, status);
  const description = isRecord(body) && typeof body.error_description === "string" ? body.error_description : "";
  const code = /AADSTS\d+/.exec(description)?.[0] ?? (isRecord(body) && typeof body.error === "string" ? body.error : undefined);
  return new MailSendError(GRAPH_MSG.credentials(code), false, undefined, status);
}

/** Error of sendMail (pure). */
export function sendMailError(status: number, body: unknown, sender: string, retryAfterMs?: number): MailSendError {
  const { code, message } = graphError(body);
  if (isTransient(status)) return new MailSendError(GRAPH_MSG.busy(status), true, retryAfterMs, status);
  if (status === 401) return new MailSendError(GRAPH_MSG.credentials(code || undefined), false, undefined, status);
  if (status === 403 || code === "ErrorAccessDenied") return new MailSendError(GRAPH_MSG.accessDenied(sender), false, undefined, status);
  if (status === 404 || code === "ErrorInvalidUser" || code === "MailboxNotEnabledForRESTAPI" || code === "ResourceNotFound") {
    return new MailSendError(GRAPH_MSG.mailboxNotFound(sender), false, undefined, status);
  }
  if (status === 413) return new MailSendError(GRAPH_MSG.tooLarge, false, undefined, status);
  if (code === "ErrorInvalidRecipients") return new MailSendError(GRAPH_MSG.invalidRecipients, false, undefined, status);
  return new MailSendError(GRAPH_MSG.rejected(status, code, message), false, undefined, status);
}

/** fetch failed (DNS, TLS, reset, timeout): retryable. */
export function networkError(e: unknown): MailSendError {
  const name = e instanceof Error ? e.name : "";
  const detail = name === "TimeoutError" || name === "AbortError" ? "hết thời gian chờ" : e instanceof Error ? short(e.message) : "";
  return new MailSendError(GRAPH_MSG.network(detail), true);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** `promise`, or OutOfTimeError after `ms` (the promise itself goes on; its outcome then only reaches other callers). */
function withinBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OutOfTimeError("no Microsoft Graph access token before the deadline")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface GraphTransportDeps {
  /** Default: global fetch. */
  fetch?: typeof fetch;
  /** Default: Date.now. */
  now?: () => number;
  /** Per HTTP request; default 30 s. */
  timeoutMs?: number;
}

export function createGraphTransport(config: GraphTransportConfig, deps: GraphTransportDeps = {}): MailTransport {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let token: { value: string; refreshAt: number } | undefined;
  let pending: Promise<string> | undefined;

  /** Time left for requests: until GRAPH_DEADLINE_MARGIN_MS before `deadline`. */
  const timeLeft = (deadline: number) => deadline - now() - GRAPH_DEADLINE_MARGIN_MS;

  /**
   * Timeout of the sendMail request: 30 s, shortened to end GRAPH_DEADLINE_MARGIN_MS before `deadline`. OutOfTimeError
   * when less than `minSend` would be left: the request is not started (nothing is sent).
   */
  function sendTimeout(deadline: number | undefined, minSend: number): number {
    if (deadline === undefined) return timeoutMs;
    const left = timeLeft(deadline);
    if (left < minSend) throw new OutOfTimeError("not enough time left to start the Microsoft Graph sendMail request");
    return Math.min(timeoutMs, left);
  }

  async function request(url: string, init: RequestInit, timeout: number): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      throw networkError(e);
    }
  }

  /** The token request, always with the full request timeout (it is shared by callers with different deadlines). */
  async function fetchToken(): Promise<string> {
    const form = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: GRAPH_SCOPE, grant_type: "client_credentials" });
    const res = await request(
      graphTokenUrl(config.tenantId),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
      timeoutMs,
    );
    const body = await readJson(res);
    if (!res.ok) throw tokenError(res.status, body, parseRetryAfter(res.headers.get("retry-after"), now()));
    const value = isRecord(body) && typeof body.access_token === "string" ? body.access_token : "";
    const rawExpires = isRecord(body) ? body.expires_in : undefined;
    const expiresIn = typeof rawExpires === "number" ? rawExpires : typeof rawExpires === "string" ? Number(rawExpires) : Number.NaN;
    if (!value || !Number.isFinite(expiresIn)) throw new MailSendError(GRAPH_MSG.badToken, true, undefined, res.status);
    token = { value, refreshAt: now() + expiresIn * 1000 - TOKEN_EARLY_REFRESH_MS };
    return value;
  }

  /**
   * A valid token: the cached one, else the shared token request (started by the first caller). A caller with a
   * deadline waits at most its remaining budget minus `minSend`, the time its sendMail request needs afterwards
   * (OutOfTimeError), without cancelling the request for the others; with less than GRAPH_MIN_REQUEST_MS of that, it
   * neither starts nor joins the request.
   */
  async function accessToken(deadline: number | undefined, minSend: number): Promise<string> {
    if (token && token.refreshAt > now()) return token.value;
    const budget = deadline === undefined ? undefined : timeLeft(deadline) - minSend;
    if (budget !== undefined && budget < GRAPH_MIN_REQUEST_MS) {
      throw new OutOfTimeError("not enough time left for a Microsoft Graph access token and the send");
    }
    pending ??= fetchToken().finally(() => {
      pending = undefined;
    });
    return budget === undefined ? pending : withinBudget(pending, budget);
  }

  return {
    configured: true,
    sender: config.sender,
    async send(mail: OutgoingMail, opts: SendOptions = {}): Promise<void> {
      const { deadline } = opts;
      const body = JSON.stringify(graphSendMailBody(mail, config));
      const bytes = Buffer.byteLength(body, "utf8");
      if (bytes > GRAPH_MAX_REQUEST_BYTES) throw new MailSendError(GRAPH_MSG.tooLarge, false, undefined, 413);
      const minSend = graphMinSendMs(bytes);
      for (let attempt = 1; ; attempt++) {
        const used = await accessToken(deadline, minSend);
        const authorization = `Bearer ${used}`;
        // Checked again after the token wait and before the retry of a 401 (nothing has been sent before either).
        const timeout = sendTimeout(deadline, minSend);
        const res = await request(graphSendMailUrl(config.sender), { method: "POST", headers: { authorization, "content-type": "application/json" }, body }, timeout);
        if (res.ok) {
          await res.arrayBuffer().catch(() => undefined);
          return;
        }
        const errorBody = await readJson(res);
        if (res.status === 401 && attempt === 1) {
          token = undefined; // revoked / rotated secret: one retry with a fresh token
          continue;
        }
        // Permission just granted in Entra: the next send asks for a new token (a newer cached one is kept).
        if (res.status === 403 && token?.value === used) token = undefined;
        throw sendMailError(res.status, errorBody, config.sender, parseRetryAfter(res.headers.get("retry-after"), now()));
      }
    },
  };
}
