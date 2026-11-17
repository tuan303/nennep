import type { MailTestResponse } from "@/lib/contract";
import { levelFromParam } from "@/lib/server/admin/common";
import { apiHandler } from "@/lib/server/handler";
import { appBaseUrl } from "@/lib/server/mail/base-url";
import { sendTestMail } from "@/lib/server/mail/test-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Gửi thư thử tới tôi": sends a test message to the caller's own email now; `{ ok: false, error }` when Microsoft 365
 * refused it. 409 not configured, 400 address outside the allowed domains, 429 after 5 sends in 10 minutes.
 */
export const POST = apiHandler<{ level: string }>({ permission: "settings.manage" }, async ({ req, user, ip, params }): Promise<MailTestResponse> => {
  const levelId = levelFromParam(params.level);
  return sendTestMail({ user, ip }, levelId, appBaseUrl(req.nextUrl.origin));
});
