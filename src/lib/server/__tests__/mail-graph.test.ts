/**
 * Microsoft Graph transport with a fake fetch (no network, no emulators, fake credentials): token request and cache,
 * sendMail body, error mapping (retryable or not, Vietnamese hints, Retry-After), 401 refresh, size guard.
 */
import { describe, expect, it } from "vitest";
import {
  GRAPH_MAX_REQUEST_BYTES,
  GRAPH_MSG,
  createGraphTransport,
  graphRequestBytes,
  graphSendMailBody,
  parseRetryAfter,
  type GraphSendMailBody,
} from "../mail/graph";
import { MailSendError, type GraphTransportConfig, type OutgoingMail } from "../mail/types";

const CONFIG: GraphTransportConfig = {
  tenantId: "tenant-test",
  clientId: "client-test",
  clientSecret: "secret-test",
  sender: "nennep@example.edu.vn",
  senderName: "Nền nếp NSHM",
};
const MAIL: OutgoingMail = {
  to: ["gv.6a01@example.edu.vn"],
  cc: ["bgh@example.edu.vn"],
  subject: "[Nền nếp] Thử",
  html: "<p>Xin chào</p>",
  attachments: [{ name: "bao-cao.pdf", contentType: "application/pdf", contentBase64: "JVBERi0=" }],
};
const TOKEN_URL = "https://login.microsoftonline.com/tenant-test/oauth2/v2.0/token";
const SEND_URL = "https://graph.microsoft.com/v1.0/users/nennep@example.edu.vn/sendMail";

interface Call {
  url: string;
  init: RequestInit;
}
type Reply = (call: Call) => Response;

function fakeFetch(replies: Reply[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected request ${call.url}`);
    return reply(call);
  };
  return { fetch: fn as typeof fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const token = (value = "tok-1", expiresIn = 3599): Reply => () => json(200, { token_type: "Bearer", expires_in: expiresIn, access_token: value });
const accepted: Reply = () => new Response(null, { status: 202 });
const graphError = (status: number, code: string, message = "msg", headers: Record<string, string> = {}): Reply => () => json(status, { error: { code, message } }, headers);

async function sendError(replies: Reply[], mail: OutgoingMail = MAIL): Promise<MailSendError> {
  const { fetch } = fakeFetch(replies);
  const t = createGraphTransport(CONFIG, { fetch });
  try {
    await t.send(mail);
  } catch (e) {
    if (e instanceof MailSendError) return e;
    throw e;
  }
  throw new Error("send did not fail");
}

describe("createGraphTransport – success", () => {
  it("gets an app-only token, then POSTs sendMail with the HTML message, recipients, attachment and sender name", async () => {
    const { fetch, calls } = fakeFetch([token(), accepted]);
    const t = createGraphTransport(CONFIG, { fetch });
    expect(t.configured).toBe(true);
    expect(t.sender).toBe("nennep@example.edu.vn");
    await t.send(MAIL);
    expect(calls.map((c) => c.url)).toEqual([TOKEN_URL, SEND_URL]);

    const form = new URLSearchParams(String(calls[0].init.body));
    expect(calls[0].init.method).toBe("POST");
    expect(Object.fromEntries(form)).toEqual({ client_id: "client-test", client_secret: "secret-test", scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });

    const headers = new Headers(calls[1].init.headers);
    expect(headers.get("authorization")).toBe("Bearer tok-1");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(String(calls[1].init.body)) as GraphSendMailBody;
    expect(body).toEqual({
      message: {
        subject: "[Nền nếp] Thử",
        body: { contentType: "HTML", content: "<p>Xin chào</p>" },
        from: { emailAddress: { address: "nennep@example.edu.vn", name: "Nền nếp NSHM" } },
        toRecipients: [{ emailAddress: { address: "gv.6a01@example.edu.vn" } }],
        ccRecipients: [{ emailAddress: { address: "bgh@example.edu.vn" } }],
        internetMessageHeaders: [{ name: "X-Auto-Response-Suppress", value: "All" }],
        attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: "bao-cao.pdf", contentType: "application/pdf", contentBytes: "JVBERi0=" }],
      },
      saveToSentItems: true,
    });
    expect(calls[1].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("caches the token until 60 s before it expires; concurrent sends share one token request", async () => {
    let now = 1_000_000;
    const { fetch, calls } = fakeFetch([token("tok-1", 3600), accepted, accepted, accepted, token("tok-2", 3600), accepted]);
    const t = createGraphTransport(CONFIG, { fetch, now: () => now });
    await Promise.all([t.send(MAIL), t.send(MAIL)]);
    now += 3_500_000; // < 3600 s − 60 s
    await t.send(MAIL);
    now += 50_000; // past the early refresh point
    await t.send(MAIL);
    const auth = calls.filter((c) => c.url === SEND_URL).map((c) => new Headers(c.init.headers).get("authorization"));
    expect(calls.filter((c) => c.url === TOKEN_URL)).toHaveLength(2);
    expect(auth).toEqual(["Bearer tok-1", "Bearer tok-1", "Bearer tok-1", "Bearer tok-2"]);
  });

  it("a 401 from sendMail retries once with a fresh token", async () => {
    const { fetch, calls } = fakeFetch([token("old"), graphError(401, "InvalidAuthenticationToken"), token("new"), accepted]);
    await createGraphTransport(CONFIG, { fetch }).send(MAIL);
    expect(calls.map((c) => c.url)).toEqual([TOKEN_URL, SEND_URL, TOKEN_URL, SEND_URL]);
    expect(new Headers(calls[3].init.headers).get("authorization")).toBe("Bearer new");
  });

  it("omits attachments when there are none", () => {
    const body = graphSendMailBody({ ...MAIL, attachments: [] }, CONFIG);
    expect("attachments" in body.message).toBe(false);
  });
});

describe("createGraphTransport – errors", () => {
  it("wrong credentials at the token endpoint → not retryable, AADSTS code as a hint", async () => {
    const e = await sendError([() => json(401, { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided. Trace ID: x" })]);
    expect(e).toMatchObject({ retryable: false, status: 401, message: GRAPH_MSG.credentials("AADSTS7000215") });
    expect(e.message).toBe("Sai Tenant ID / Client ID / Client secret hoặc secret đã hết hạn (AADSTS7000215).");
    const tenant = await sendError([() => json(400, { error: "invalid_request", error_description: "AADSTS90002: Tenant not found." })]);
    expect(tenant).toMatchObject({ retryable: false, message: GRAPH_MSG.credentials("AADSTS90002") });
  });

  it("a second 401 from sendMail → not retryable credentials error", async () => {
    const e = await sendError([token(), graphError(401, "InvalidAuthenticationToken"), token(), graphError(401, "InvalidAuthenticationToken")]);
    expect(e).toMatchObject({ retryable: false, status: 401 });
    expect(e.message).toContain("Sai Tenant ID / Client ID / Client secret");
  });

  it("403 → the app has no Mail.Send right on the mailbox; 404 / ErrorInvalidUser → mailbox not found", async () => {
    const denied = await sendError([token(), graphError(403, "ErrorAccessDenied", "Access is denied.")]);
    expect(denied).toMatchObject({ retryable: false, status: 403, message: GRAPH_MSG.accessDenied("nennep@example.edu.vn") });
    expect(denied.message).toContain("Ứng dụng chưa được cấp quyền gửi thư từ hộp thư nennep@example.edu.vn");
    const missing = await sendError([token(), graphError(404, "ErrorInvalidUser", "The requested user is invalid.")]);
    expect(missing).toMatchObject({ retryable: false, message: GRAPH_MSG.mailboxNotFound("nennep@example.edu.vn") });
    expect(missing.message).toContain("Không tìm thấy hộp thư gửi");
    const invalidUser400 = await sendError([token(), graphError(400, "ErrorInvalidUser")]);
    expect(invalidUser400.message).toBe(GRAPH_MSG.mailboxNotFound("nennep@example.edu.vn"));
  });

  it("other 400s are not retryable (invalid recipients, generic rejection with code and message)", async () => {
    expect((await sendError([token(), graphError(400, "ErrorInvalidRecipients")])).message).toBe(GRAPH_MSG.invalidRecipients);
    const other = await sendError([token(), graphError(400, "ErrorMessageSubmissionBlocked", "Submission blocked")]);
    expect(other).toMatchObject({ retryable: false, status: 400, message: "Microsoft 365 từ chối thư (HTTP 400, ErrorMessageSubmissionBlocked): Submission blocked." });
  });

  it("429 / 503 / 504 / 500 → retryable, Retry-After honoured (seconds)", async () => {
    const throttled = await sendError([token(), graphError(429, "ApplicationThrottled", "Too many", { "retry-after": "120" })]);
    expect(throttled).toMatchObject({ retryable: true, status: 429, retryAfterMs: 120_000, message: GRAPH_MSG.busy(429) });
    for (const status of [500, 503, 504]) {
      const e = await sendError([token(), graphError(status, "ServiceUnavailable")]);
      expect(e).toMatchObject({ retryable: true, status });
    }
    const tokenBusy = await sendError([() => json(503, { error: "temporarily_unavailable" })]);
    expect(tokenBusy).toMatchObject({ retryable: true, message: GRAPH_MSG.tokenBusy(503) });
  });

  it("network failures and timeouts → retryable", async () => {
    const down = await sendError([
      token(),
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    expect(down).toMatchObject({ retryable: true, message: GRAPH_MSG.network("fetch failed") });
    const slow = await sendError([
      () => {
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      },
    ]);
    expect(slow).toMatchObject({ retryable: true, message: GRAPH_MSG.network("hết thời gian chờ") });
  });

  it("a token response without access_token → retryable", async () => {
    expect(await sendError([() => json(200, { token_type: "Bearer" })])).toMatchObject({ retryable: true, message: GRAPH_MSG.badToken });
  });

  it("refuses requests above GRAPH_MAX_REQUEST_BYTES without calling Microsoft", async () => {
    const big: OutgoingMail = { ...MAIL, attachments: [{ name: "x.pdf", contentType: "application/pdf", contentBase64: "A".repeat(GRAPH_MAX_REQUEST_BYTES) }] };
    expect(graphRequestBytes(big)).toBeGreaterThan(GRAPH_MAX_REQUEST_BYTES);
    expect(graphRequestBytes(MAIL)).toBeLessThan(2_000);
    const { fetch, calls } = fakeFetch([]);
    await expect(createGraphTransport(CONFIG, { fetch }).send(big)).rejects.toMatchObject({ retryable: false, status: 413, message: GRAPH_MSG.tooLarge });
    expect(calls).toHaveLength(0);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds or an HTTP date", () => {
    const now = Date.parse("2026-10-21T03:00:00.000Z");
    expect(parseRetryAfter("30", now)).toBe(30_000);
    expect(parseRetryAfter("Wed, 21 Oct 2026 03:02:00 GMT", now)).toBe(120_000);
    expect(parseRetryAfter("Wed, 21 Oct 2026 02:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});
