import type { OkResponse } from "@/lib/contract";
import { apiHandler } from "@/lib/server/handler";
import { appBaseUrl } from "@/lib/server/mail/base-url";
import { LONG_DRAIN_MS, scheduleDrain } from "@/lib/server/mail/drain";
import { retryMailJob } from "@/lib/server/mail/outbox";
import { REPORT_BUILDERS } from "@/lib/server/mail/report-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * "Gửi lại" a FAILED / SKIPPED email (settings.manage, or report.send for one's own jobs; rate-limited per user):
 * back to PENDING, then drained right after the response (its batch for a report email); audit RETRY_EMAIL.
 */
export const POST = apiHandler<{ id: string }>({ anyPermission: ["settings.manage", "report.send"] }, async ({ req, user, ip, params }): Promise<OkResponse> => {
  const startedAt = Date.now();
  const job = await retryMailJob({ user, ip }, params.id);
  scheduleDrain({ kinds: [job.kind], batchId: job.batchId, builders: REPORT_BUILDERS, deadlineMs: LONG_DRAIN_MS, startedAt, baseUrl: appBaseUrl(req.nextUrl.origin) });
  return { ok: true };
});
