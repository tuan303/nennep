"use client";
import { useCallback, useRef, useState } from "react";
import { toast, useLatest } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { MIME, downloadBlob } from "@/lib/client/download";
import type { PeriodReport } from "./lib/report-model";
import { REPORT_SHEET_COLUMNS, reportFileBase, reportSheetRows, reportSheetSubtitle, reportSheetTitle } from "./lib/report-export";

/**
 * "Xuất Excel chi tiết": every incident of the report scope (sorted by date then code) with Mã sự việc / Mã lớp /
 * Mã lỗi / Mã HS, remediation and GVCN feedback. ExcelJS loads on demand; the export is audited (kind "report").
 */
export function useReportExport(report: PeriodReport | undefined, today: string): { exporting: boolean; exportExcel: () => Promise<void> } {
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);
  const latest = useLatest({ report, today });

  const exportExcel = useCallback(async () => {
    const { report: r, today: day } = latest.current;
    if (!r || busy.current) return;
    busy.current = true;
    setExporting(true);
    try {
      const { exportSimpleSheet } = await import("@/lib/excel");
      const rows = reportSheetRows(r.detail);
      const bytes = await exportSimpleSheet(
        reportSheetTitle(r),
        REPORT_SHEET_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })),
        rows,
        { subtitle: reportSheetSubtitle(r, day), sheetName: "Chi tiết" },
      );
      const fileName = `${reportFileBase(r)}.xlsx`;
      downloadBlob(bytes, fileName, MIME.xlsx);
      toast.success("Đã xuất Excel chi tiết", { description: fileName });
      try {
        await api.exportsLog({
          levelId: r.levelId,
          kind: "report",
          detail: { mode: r.period.mode, key: r.period.key ?? null, to: r.recipientKey, rows: rows.length },
        });
      } catch (err) {
        toast.warning("Đã tải tệp nhưng chưa ghi được nhật ký xuất", { description: errorMessage(err) });
      }
    } catch (err) {
      toast.error(errorMessage(err, "Không xuất được tệp Excel. Vui lòng thử lại."));
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }, [latest]);

  return { exporting, exportExcel };
}
