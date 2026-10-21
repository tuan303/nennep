"use client";
import { useState } from "react";
import { Copy, FileSpreadsheet, Printer } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { copyWithFallback } from "@/components/app/widgets";
import { api, downloadBlob, errorMessage, MIME } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import type { LevelDataset } from "@/lib/types";
import { buildCopyText, gvcnExportFileName, gvcnPrintTitle } from "./lib/copy-text";
import type { GvcnReport } from "./lib/report-model";

export interface ReportActionsProps {
  ds: LevelDataset;
  report: GvcnReport;
  periodText: string;
  today: string;
}

/** Print with a meaningful document title (becomes the default PDF file name), restored afterwards. */
function printWithTitle(title: string) {
  const previous = document.title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  document.title = title;
  window.print();
}

/** "Sao chép" (Zalo text) · "In / Lưu PDF" · "Xuất Excel" (excel.export). Rendered in the PageHeader (hidden on paper). */
export function ReportActions({ ds, report, periodText, today }: ReportActionsProps) {
  const { can } = useSession();
  const [exporting, setExporting] = useState(false);

  async function copy() {
    await copyWithFallback(buildCopyText(report, periodText, today), {
      success: "Đã sao chép báo cáo",
      successDescription: "Dán vào Zalo hoặc tin nhắn để gửi GVCN.",
      title: "Sao chép báo cáo GVCN",
      failure: "Không sao chép được. Vui lòng thử lại hoặc dùng “In / Lưu PDF”.",
    });
  }

  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportGvcnReport } = await import("@/lib/excel");
      const bytes = await exportGvcnReport({
        levelName: LEVELS[ds.levelId].name,
        periodLabel: periodText,
        today,
        classCode: report.classCode,
        homeroomTeacher: report.classInfo?.homeroomTeacher,
        incidents: report.incidents,
      });
      downloadBlob(bytes, gvcnExportFileName(report.classCode, report.period), MIME.xlsx);
      toast.success("Đã xuất tệp Excel", { description: `${report.incidents.length} sự việc của lớp ${report.classCode}.` });
      await api
        .exportsLog({
          levelId: ds.levelId,
          kind: "gvcn",
          detail: { classCode: report.classCode, period: report.period.key ?? report.period.mode, mode: report.period.mode, incidents: report.incidents.length },
        })
        .catch(() => undefined); // audit trail only – never block the download
    } catch (err) {
      toast.error(errorMessage(err, "Chưa xuất được tệp Excel. Vui lòng thử lại."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Button variant="primary" icon={Copy} onClick={() => void copy()}>
        Sao chép
      </Button>
      <Button variant="secondary" icon={Printer} onClick={() => printWithTitle(gvcnPrintTitle(report.classCode, report.period))}>
        In / Lưu PDF
      </Button>
      {can("excel.export") ? (
        <Button variant="secondary" icon={FileSpreadsheet} loading={exporting} onClick={() => void exportExcel()}>
          Xuất Excel
        </Button>
      ) : null}
    </>
  );
}
