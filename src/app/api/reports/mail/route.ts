import { ReportMailSendSchema, type ReportMailSendResponse } from "@/lib/contract";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { scheduleReportBatch } from "@/lib/server/mail/report-job";
import { queueReportMail } from "@/lib/server/mail/report-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The batch is drained after the response (PDF per message): up to 280 s of the 300 s, counted from the request start. */
export const maxDuration = 300;

/** "Gửi email" of Báo cáo tuần/tháng: one REPORT job per target in one batch, sent in the background. */
export const POST = apiHandler({ permission: "report.send" }, async ({ req, user, ip }): Promise<ReportMailSendResponse> => {
  const startedAt = Date.now();
  const input = await parseBody(req, ReportMailSendSchema);
  const origin = req.nextUrl.origin;
  const res = await queueReportMail({ user, ip }, input, origin);
  scheduleReportBatch(res.batchId, origin, startedAt);
  return res;
});
