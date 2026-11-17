import type { MailBatchResponse } from "@/lib/contract";
import { apiHandler } from "@/lib/server/handler";
import { scheduleReportBatch } from "@/lib/server/mail/report-job";
import { readReportBatch } from "@/lib/server/mail/report-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A stalled batch is drained again after the response. */
export const maxDuration = 300;

type Params = { id: string };

/** Progress of one "Gửi email" click (polled every 3 s); re-schedules the drain when the first one ended early. */
export const GET = apiHandler<Params>({ permission: "report.send" }, async ({ req, user, params }): Promise<MailBatchResponse> => {
  const startedAt = Date.now();
  const { view, needsDrain } = await readReportBatch(user, params.id);
  if (needsDrain) scheduleReportBatch(view.batchId, req.nextUrl.origin, startedAt);
  return view;
});
