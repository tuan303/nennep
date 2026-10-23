"use client";
import { useMemo, useState } from "react";
import { CalendarRange, Download, FileSpreadsheet, Globe } from "lucide-react";
import { Button, Card, SegmentedControl, toast } from "@/components/ui";
import { PERIOD_MODE_OPTIONS, PeriodPicker } from "@/components/app/shell";
import { api, downloadBlob, errorMessage, MIME } from "@/lib/client/api";
import { fmtNumber } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { LEVELS } from "@/lib/constants";
import { defaultPeriod, periodLabel, periodOptions, rankingRuleOf } from "@/lib/engine";
import { buildHtmlSnapshot } from "@/lib/excel/html-snapshot";
import type { LevelDataset, Period, PeriodMode } from "@/lib/types";
import { Notice } from "@/components/data-inspect/notice";
import { keyForMode, rankingExportRows, snapshotFileName, snapshotInput, studentExportRows, workbookContents, workbookFileName } from "./lib/export-model";

/** Fire-and-forget audit of a browser export (EXPORT_EXCEL); a failure must not spoil the download. */
function logExport(input: Parameters<typeof api.exportsLog>[0]) {
  api.exportsLog(input).catch(() => undefined);
}

export interface ExportPanelProps {
  ds: LevelDataset;
}

/** FR-XLS-003 + FR-SNP-001: period for the report sheets, the level workbook and the offline HTML snapshot. */
export function ExportPanel({ ds }: ExportPanelProps) {
  const today = useToday();
  const lists = useMemo(() => periodOptions(ds.weeks, ds.config.semesters, today), [ds.weeks, ds.config.semesters, today]);
  const [period, setPeriod] = useState<Period>(() => defaultPeriod(ds.weeks, today));
  const [busy, setBusy] = useState<"xlsx" | "html" | null>(null);
  const label = periodLabel(period, ds.config.semesters);
  const level = LEVELS[ds.levelId];
  const contents = useMemo(() => workbookContents(ds), [ds]);

  const changeMode = (mode: PeriodMode) => setPeriod(mode === "all" ? { mode } : { mode, key: keyForMode(lists, mode) });

  async function exportWorkbook() {
    setBusy("xlsx");
    try {
      const { exportLevelWorkbook } = await import("@/lib/excel");
      const bytes = await exportLevelWorkbook(ds, {
        today,
        levelName: level.name,
        periodLabel: label,
        rankingRows: rankingExportRows(ds, period, today),
        studentRows: studentExportRows(ds, period, today),
      });
      const fileName = workbookFileName(ds.levelId, today);
      downloadBlob(bytes, fileName, MIME.xlsx);
      logExport({ levelId: ds.levelId, kind: "workbook", detail: { fileName, period, periodLabel: label, incidents: ds.incidents.length, rewards: ds.rewards.length } });
      toast.success("Đã xuất workbook Excel", { description: fileName });
    } catch (err) {
      toast.error(errorMessage(err, "Chưa xuất được file Excel. Vui lòng thử lại."));
    } finally {
      setBusy(null);
    }
  }

  function exportSnapshot() {
    setBusy("html");
    try {
      const html = buildHtmlSnapshot(snapshotInput(ds, period, today, new Date().toISOString()));
      const fileName = snapshotFileName(ds.levelId, today);
      downloadBlob(html, fileName, MIME.html);
      logExport({ levelId: ds.levelId, kind: "html", detail: { fileName, period, periodLabel: label } });
      toast.success("Đã tạo bản chụp HTML", { description: fileName });
    } catch (err) {
      toast.error(errorMessage(err, "Chưa tạo được bản chụp. Vui lòng thử lại."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Kỳ báo cáo" subtitle="Áp dụng cho trang Xếp hạng, BC Học sinh và bản chụp HTML" icon={CalendarRange}>
        <div className="flex flex-col gap-3">
          <SegmentedControl options={PERIOD_MODE_OPTIONS} value={period.mode} onChange={changeMode} fullWidth ariaLabel="Loại kỳ báo cáo" />
          <PeriodPicker mode={period.mode} value={period.key} options={lists} onChange={(key) => setPeriod({ mode: period.mode, key })} />
        </div>
      </Card>

      <Card
        title="Xuất workbook Excel"
        subtitle={`Toàn bộ dữ liệu cấp ${level.short} năm học ${ds.config.schoolYear}`}
        icon={FileSpreadsheet}
        footer={<span className="num text-xs text-slate-500">{workbookFileName(ds.levelId, today)}</span>}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-slate-600">
            Gồm các trang Nhập liệu, HS liên quan, DS Học sinh, Danh mục, Bảng điểm lỗi, Cấu hình, Lịch tuần, Điểm thưởng (cả năm) và Xếp hạng, BC Học sinh theo kỳ{" "}
            <strong className="text-slate-800">{label}</strong>. File có thể chỉnh sửa rồi nhập lại.
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Nội dung workbook">
            {contents.map((c) => (
              <li key={c.label} className="num rounded-full bg-surface-3 px-2.5 py-1 text-xs font-medium text-slate-700">
                {fmtNumber(c.value)} {c.label}
              </li>
            ))}
          </ul>
          <Button variant="primary" icon={Download} loading={busy === "xlsx"} disabled={busy !== null} onClick={() => void exportWorkbook()} block>
            {busy === "xlsx" ? "Đang tạo file…" : "Xuất Excel"}
          </Button>
        </div>
      </Card>

      <Card title="Bản chụp HTML (offline)" subtitle={`Báo cáo một trang · ${label}`} icon={Globe}>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-slate-600">
            Một file HTML tự chứa: chỉ số chính, xếp hạng {rankingRuleOf(ds.levelId).scope === "level" ? "toàn cấp" : "theo khối"}, vấn đề và lớp nổi bật. Mở
            được trên mọi trình duyệt, không cần mạng, in ra khổ A4.
          </p>
          <Notice tone="star">Chỉ để lưu trữ/chia sẻ, không phải nguồn dữ liệu – không dùng file này để nhập lại.</Notice>
          <Button variant="secondary" icon={Download} loading={busy === "html"} disabled={busy !== null} onClick={exportSnapshot} block>
            Tải bản chụp HTML
          </Button>
        </div>
      </Card>
    </div>
  );
}
