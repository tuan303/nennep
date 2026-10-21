import { LoginFailedSchema, type OkResponse } from "@/lib/contract";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { enforceRateLimit, ipRateKey } from "@/lib/server/rate-limit";
import { recordLoginFailed } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT_PER_MINUTE = 5;
const LIMIT_PER_HOUR = 30;

/**
 * Public: the client reports a failed sign-in attempt (audit LOGIN_FAILED). Rate-limited per client address
 * (IPv6 per /64); what is actually stored is bounded further by `recordLoginFailed` (valid e-mails only, one entry
 * per e-mail per 10 minutes per instance, school-wide daily cap). The answer is always `{ ok: true }`.
 */
export const POST = apiHandler({ public: true }, async ({ req, ip }): Promise<OkResponse> => {
  const key = ipRateKey(ip);
  enforceRateLimit(`login-failed:m:${key}`, LIMIT_PER_MINUTE, 60_000);
  enforceRateLimit(`login-failed:h:${key}`, LIMIT_PER_HOUR, 3_600_000);
  const input = await parseBody(req, LoginFailedSchema, { maxBytes: 4_000 });
  await recordLoginFailed(input.email, input.reason, ip);
  return { ok: true };
});
