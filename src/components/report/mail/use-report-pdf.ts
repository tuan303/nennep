"use client";
/**
 * "Tải PDF": GET /api/reports/pdf renders the A4 report on the server (same page as the email attachment, saved
 * "Công tác phối hợp") and the browser saves it under the report's file name. One download at a time.
 */
import { useCallback, useRef, useState } from "react";
import { toast, useLatest } from "@/components/ui";
import { downloadBlob, errorMessage } from "@/lib/client/api";
import type { PeriodReport } from "../lib/report-model";
import { reportMailApi } from "./mail-api";
import { reportPdfFileName, reportPdfQuery } from "./lib/report-pdf";

export function useReportPdf(
  report: PeriodReport | undefined,
  detail: boolean,
  planDirty: boolean,
): { downloading: boolean; download: () => Promise<void> } {
  const [downloading, setDownloading] = useState(false);
  const busy = useRef(false);
  const latest = useLatest({ report, detail, planDirty });

  const download = useCallback(async () => {
    const { report: r, detail: withDetail, planDirty: dirty } = latest.current;
    const query = r ? reportPdfQuery(r, withDetail) : undefined;
    if (!r || !query || busy.current) return;
    busy.current = true;
    setDownloading(true);
    try {
      const blob = await reportMailApi.pdf(query);
      const fileName = reportPdfFileName(r);
      downloadBlob(blob, fileName, "application/pdf");
      if (dirty) {
        toast.warning("Đã tải PDF – công tác phối hợp chưa được lưu", {
          description: "File PDF dùng nội dung đã lưu. Bấm “Lưu” rồi tải lại để có nội dung đang sửa.",
        });
      } else {
        toast.success("Đã tải PDF", { description: fileName });
      }
    } catch (err) {
      toast.error("Chưa tải được PDF", { description: errorMessage(err) });
    } finally {
      busy.current = false;
      setDownloading(false);
    }
  }, [latest]);

  return { downloading, download };
}
