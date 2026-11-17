/**
 * Builder of REPORT jobs (Báo cáo tuần/tháng by email) and REPORT_BUILDERS, the builders of every job kind.
 * Import this module ONLY from routes that may send report emails (POST /api/reports/mail, GET /api/mail/batches/:id,
 * POST /api/mail/jobs/:id/retry, GET /api/cron/mail): it brings the PDF renderer (puppeteer-core / Chromium, loaded
 * lazily on the first PDF), which incident / reward routes must never bundle.
 *
 * A REPORT job is rebuilt at send time from its payload with the CURRENT data and the sender's CURRENT rights
 * (loadReportForJob – a locked sender or a recipient that is no longer allowed → SKIPPED). The PDF is the real report
 * page printed by Chromium; it is attached when its base64 form is ≤ REPORT_ATTACHMENT_MAX_BASE64 (the Graph request
 * must stay below ~3.5 MB), otherwise the email says so and links to the app. A failed render is retried (retryable
 * MailSendError) until REPORT_PDF_MAX_ATTEMPTS renders failed – at once when PDFs cannot work in this deployment
 * (Chromium cannot start at all: BrowserLaunchError; no print-job key: PrintKeyMissingError) – then the email goes
 * out without the PDF. The render ends SEND_MIN_BUDGET_MS before the drain deadline (time for the send);
 * with less time left it is not started (OutOfTimeError: the drain puts the job back without counting the attempt).
 */
import { reportFileBase } from "@/components/report/lib/report-export";
import { MAIL_DEFAULT_SENDER_NAME, REPORT_PDF_MAX_ATTEMPTS } from "../../constants";
import type { MailJobKind } from "../../types";
import { appBaseUrl } from "./base-url";
import { LONG_DRAIN_MS, SEND_MIN_BUDGET_MS, buildTestJob, scheduleDrain } from "./drain";
import { buildNoticeJob, isReportPayload } from "./outbox";
import { isBrowserLaunchError, renderReportPdf } from "./pdf";
import { isPrintKeyMissingError } from "./print-key";
import type { PrintJobSpec } from "./print-jobs";
import { loadReportForJob } from "./report-data";
import { buildReportMail, pdfState, reportLink } from "./report-email";
import { mailStatus } from "./transport";
import { MailSendError, OutOfTimeError, type JobBuilder, type OutgoingMail } from "./types";

export const REPORT_JOB_MSG = {
  payload: "Thư báo cáo thiếu thông tin kỳ báo cáo hoặc người nhận.",
  noRecipients: "Thư báo cáo không có người nhận.",
  pdfFailed: "Chưa tạo được file PDF của báo cáo – hệ thống sẽ thử lại.",
} as const;

/**
 * After a failed render on attempt `attempts` (pure): true → send the email without the PDF now; false → retry the
 * job later. A browser that cannot start, or a missing print-job key, fails the same way on every retry of this
 * deployment; a transient launch failure (TransientLaunchError) is an ordinary failed render.
 */
export function sendWithoutPdf(attempts: number, error: unknown): boolean {
  return attempts >= REPORT_PDF_MAX_ATTEMPTS || isBrowserLaunchError(error) || isPrintKeyMissingError(error);
}

export const buildReportJob: JobBuilder = async (job, ctx) => {
  if (job.kind !== "REPORT" || !isReportPayload(job.payload)) return { skip: REPORT_JOB_MSG.payload };
  if (job.to.length === 0) return { skip: REPORT_JOB_MSG.noRecipients };
  const spec: PrintJobSpec = { ...job.payload, levelId: job.levelId };
  const loaded = await loadReportForJob(spec);
  if (!loaded.ok) return { skip: loaded.reason };
  const { report, plan, topRatio } = loaded.data;

  let base64: string | undefined;
  try {
    base64 = (await renderReportPdf(spec, { ...ctx, deadline: ctx.deadline - SEND_MIN_BUDGET_MS })).toString("base64");
  } catch (e) {
    if (e instanceof OutOfTimeError) throw e; // not a failed render: no time left in this drain
    console.error(`[mail] report PDF of job ${job.id} failed (attempt ${job.attempts}):`, e);
    if (!sendWithoutPdf(job.attempts, e)) throw new MailSendError(REPORT_JOB_MSG.pdfFailed, true);
  }
  const fileName = `${reportFileBase(report)}.pdf`;
  const pdf = pdfState(base64, fileName);
  const content = buildReportMail(report, plan, {
    link: reportLink(ctx.baseUrl, spec),
    note: spec.note,
    senderName: mailStatus(ctx.baseUrl).senderName ?? MAIL_DEFAULT_SENDER_NAME,
    preparedBy: spec.preparedBy,
    topRatio,
    pdf,
  });
  const mail: OutgoingMail = { to: job.to, cc: job.cc, ...content };
  if (pdf.status === "attached" && base64 !== undefined) mail.attachments = [{ name: fileName, contentType: "application/pdf", contentBase64: base64 }];
  return { mail };
};

/** Builders of every kind, for drains that may meet any job (report batches, retry, cron). */
export const REPORT_BUILDERS: Readonly<Record<MailJobKind, JobBuilder>> = {
  NOTICE: buildNoticeJob,
  REPORT: buildReportJob,
  TEST: buildTestJob,
};

/**
 * Drains the REPORT jobs of a batch once the response is sent (routes with maxDuration = 300 s); `origin` = request
 * origin (base URL fallback), `startedAt` = start of the request (the drain deadline counts from there).
 */
export function scheduleReportBatch(batchId: string, origin?: string, startedAt: number = Date.now()): void {
  scheduleDrain({ batchId, kinds: ["REPORT"], builders: REPORT_BUILDERS, deadlineMs: LONG_DRAIN_MS, startedAt, baseUrl: appBaseUrl(origin) });
}
