import type { MailCronResponse } from "@/lib/contract";
import { Errors } from "@/lib/server/errors";
import { apiHandler } from "@/lib/server/handler";
import { appBaseUrl } from "@/lib/server/mail/base-url";
import { CRON_MSG, isCronAuthorized, runMailCron } from "@/lib/server/mail/cron";
import { REPORT_BUILDERS } from "@/lib/server/mail/report-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel cron (vercel.json): `Authorization: Bearer ${CRON_SECRET}` required (401 when unset or different). */
export const GET = apiHandler({ public: true }, async ({ req }): Promise<MailCronResponse> => {
  const startedAt = Date.now();
  if (!isCronAuthorized(req)) throw Errors.unauthenticated(CRON_MSG.unauthorized);
  return runMailCron({ builders: REPORT_BUILDERS, baseUrl: appBaseUrl(req.nextUrl.origin), startedAt });
});
