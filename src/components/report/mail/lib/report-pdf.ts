/**
 * "Tải PDF" of Báo cáo tuần/tháng (pure – unit-tested): query of GET /api/reports/pdf for the report on screen and the
 * file name (same base as "In / Lưu PDF" and "Xuất Excel chi tiết").
 */
import type { z } from "zod";
import type { ReportPdfQuerySchema } from "@/lib/contract";
import { reportFileBase } from "../../lib/report-export";
import type { PeriodReport } from "../../lib/report-model";
import { planPeriodOf } from "../../lib/report-plan";

export type ReportPdfQuery = z.input<typeof ReportPdfQuerySchema>;

/** Query of the report on screen; undefined for a period that is not a week / month (no PDF). */
export function reportPdfQuery(report: Pick<PeriodReport, "levelId" | "period" | "recipientKey">, detail: boolean): ReportPdfQuery | undefined {
  const period = planPeriodOf(report.period);
  if (!period) return undefined;
  return { level: report.levelId, mode: period.mode, key: period.key, to: report.recipientKey, detail: detail ? "1" : "0" };
}

/** "NSHM_Bao-cao_THCS_Tuan-19-10_25-10-2026_Khoi-6.pdf". */
export function reportPdfFileName(report: Pick<PeriodReport, "levelId" | "periodLabel" | "scopeLabel">): string {
  return `${reportFileBase(report)}.pdf`;
}
