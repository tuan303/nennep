/**
 * "Tải PDF" of Báo cáo tuần/tháng (GET /api/reports/pdf): the same PDF as the email attachment, rendered on demand for
 * the caller – view.dashboard + level + the recipient rules of the report screen (a GVCN: own classes only, with the
 * GVCN redaction). Works without any mail configuration. Rate-limited per user (Chromium is expensive).
 */
import type { z } from "zod";
import { buildPeriodReport } from "@/components/report/lib/report-model";
import { reportFileBase } from "@/components/report/lib/report-export";
import type { ReportPdfQuerySchema } from "../../contract";
import { todayVN } from "../../engine/dates";
import { actorName, requireLevel, requirePermission, type SessionUser } from "../auth";
import { Errors } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { assertReportPeriod } from "../report-plans";
import { appBaseUrl } from "./base-url";
import { renderReportPdfOnce } from "./pdf";
import { isPrintKeyMissingError } from "./print-key";
import type { PrintJobSpec } from "./print-jobs";
import { datasetForViewer, periodInCalendar, REPORT_DATA_MSG, reportRecipientOption } from "./report-data";
import { shortAddressee } from "./report-email";

export type ReportPdfQuery = z.output<typeof ReportPdfQuerySchema>;

/** PDFs per user and window (per server instance). */
export const REPORT_PDF_RATE = { limit: 20, windowMs: 10 * 60_000 } as const;
/**
 * Render budget of an interactive download (the user is waiting). The route allows 300 s only so that it shares the
 * function configuration of the other Chromium routes (next.config.ts); a download should not take that long.
 */
const REPORT_PDF_BUDGET_MS = 55_000;

export const REPORT_PDF_MSG = {
  recipient: "Bạn không có quyền xem báo cáo của người nhận này.",
  failed: "Không tạo được file PDF của báo cáo. Vui lòng thử lại sau hoặc dùng “In / Lưu PDF”.",
  noKey: "Máy chủ đang tắt chức năng tạo file PDF (thiếu khóa tạo file PDF – xem Cài đặt → Email). Vui lòng dùng “In / Lưu PDF”.",
} as const;

/** `attachment; filename="…"; filename*=UTF-8''…` (the base name is ASCII already; non-ASCII is replaced anyway). */
export function pdfAttachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function reportPdfForUser(user: SessionUser, q: ReportPdfQuery, origin?: string): Promise<{ pdf: Buffer; fileName: string }> {
  requirePermission(user, "view.dashboard");
  requireLevel(user, q.level);
  assertReportPeriod(q.mode, q.key);
  const ds = await datasetForViewer(q.level, user.profile);
  if (!periodInCalendar({ mode: q.mode, key: q.key }, ds.weeks)) throw Errors.validation(REPORT_DATA_MSG.period, [{ path: "key", message: REPORT_DATA_MSG.period }]);
  const option = reportRecipientOption(user.profile, ds, q.to);
  if (!option) throw Errors.forbidden(REPORT_PDF_MSG.recipient);
  enforceRateLimit(`report-pdf:${user.uid}`, REPORT_PDF_RATE.limit, REPORT_PDF_RATE.windowMs);

  const report = buildPeriodReport(ds, { period: { mode: q.mode, key: q.key }, recipient: option.recipient, viewer: user.profile }, todayVN());
  const spec: PrintJobSpec = {
    levelId: q.level,
    mode: q.mode,
    key: q.key,
    to: option.key,
    detail: q.detail === "1",
    addressee: shortAddressee(option),
    viewerUid: user.uid,
    preparedBy: actorName(user),
  };
  try {
    const pdf = await renderReportPdfOnce(spec, appBaseUrl(origin), Date.now() + REPORT_PDF_BUDGET_MS);
    return { pdf, fileName: `${reportFileBase(report)}.pdf` };
  } catch (e) {
    console.error("[pdf] report PDF download failed:", e);
    throw Errors.internal(isPrintKeyMissingError(e) ? REPORT_PDF_MSG.noKey : REPORT_PDF_MSG.failed);
  }
}
