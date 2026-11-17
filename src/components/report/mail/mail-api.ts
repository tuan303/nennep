/**
 * Typed client of the report-mail endpoints (src/lib/contract.ts) used by Báo cáo tuần/tháng. Browser only; failures
 * reject with `ApiClientError` (Vietnamese message) like `api.*` of src/lib/client/api.ts.
 */
import type { MailBatchResponse, OkResponse, ReportMailRecipientsResponse, ReportMailSendInput, ReportMailSendResponse } from "@/lib/contract";
import { requestBlob, requestJson, seg } from "@/lib/client/http";
import type { LevelId } from "@/lib/types";
import type { ReportPdfQuery } from "./lib/report-pdf";

export const reportMailApi = {
  /** Default recipients of the "Gửi email" dialog + the sending configuration (report.send). */
  recipients: (levelId: LevelId) => requestJson<ReportMailRecipientsResponse>("/api/reports/mail/recipients", { query: { level: levelId } }),
  /** Queues one email per target (one batch); sending runs on the server. */
  send: (input: ReportMailSendInput) => requestJson<ReportMailSendResponse>("/api/reports/mail", { method: "POST", body: input }),
  /** Progress of a batch. */
  batch: (batchId: string, signal?: AbortSignal) => requestJson<MailBatchResponse>(`/api/mail/batches/${seg(batchId)}`, { signal }),
  /** "Gửi lại" a FAILED / SKIPPED job of the caller. */
  retry: (jobId: string) => requestJson<OkResponse>(`/api/mail/jobs/${seg(jobId)}/retry`, { method: "POST", body: {} }),
  /** The A4 report as rendered by the server (works without mail configuration). */
  pdf: (q: ReportPdfQuery, signal?: AbortSignal) =>
    requestBlob("/api/reports/pdf", {
      query: { level: q.level, mode: q.mode, key: q.key, to: q.to, detail: q.detail },
      headers: { Accept: "application/pdf" },
      signal,
    }),
};
