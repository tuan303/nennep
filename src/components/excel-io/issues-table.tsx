"use client";
import { useMemo, useState } from "react";
import { CircleCheck, CircleX, Download, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge, Button, DataTable, EmptyState, Pill, Select, toast, type DataTableColumn } from "@/components/ui";
import { downloadBlob, errorMessage, MIME } from "@/lib/client/api";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { RowSeverity, WorkbookRowReport } from "@/lib/contract";
import type { LevelId } from "@/lib/types";
import { ISSUE_EXPORT_COLUMNS, SEVERITY_LABELS, filterIssues, issueExportRows, issueSheets, severityCounts, sortIssues, type IssueFilter } from "./lib/import-model";

const SEVERITY_LOOK = {
  OK: { tone: "ok", icon: CircleCheck },
  WARNING: { tone: "warn", icon: TriangleAlert },
  ERROR: { tone: "bad", icon: CircleX },
} as const;

export function SeverityBadge({ severity }: { severity: RowSeverity }) {
  const look = SEVERITY_LOOK[severity];
  return (
    <Badge tone={look.tone} size="sm" icon={look.icon}>
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

function pointsText(r: WorkbookRowReport): string | null {
  if (r.pointsInFile === undefined && r.computedPoints === undefined) return null;
  return `${r.pointsInFile !== undefined ? fmtNumber(r.pointsInFile) : "–"} → ${r.computedPoints !== undefined ? fmtNumber(r.computedPoints) : "–"}`;
}

function Messages({ r }: { r: WorkbookRowReport }) {
  return r.messages.length === 1 ? (
    <span>{r.messages[0]}</span>
  ) : (
    <ul className="list-disc pl-4">
      {r.messages.map((m, k) => (
        <li key={k}>{m}</li>
      ))}
    </ul>
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<WorkbookRowReport>> = [
  { key: "sheet", header: "Trang", cell: (r) => <span className="whitespace-nowrap text-[13px] font-medium">{r.sheet}</span>, sortValue: (r) => r.sheet },
  { key: "row", header: "Dòng", align: "right", cell: (r) => fmtNumber(r.rowNumber), sortValue: (r) => r.rowNumber },
  { key: "key", header: "Khóa", cell: (r) => <span className="num whitespace-nowrap text-[13px] font-semibold text-brand-900">{r.key || "–"}</span>, sortValue: (r) => r.key },
  { key: "severity", header: "Mức độ", cell: (r) => <SeverityBadge severity={r.severity} />, sortValue: (r) => (r.severity === "ERROR" ? 2 : r.severity === "WARNING" ? 1 : 0) },
  { key: "messages", header: "Nội dung", cell: (r) => <div className="min-w-[260px] max-w-[520px] text-[13px] leading-relaxed text-slate-700"><Messages r={r} /></div> },
  { key: "points", header: "Điểm (file → quy định)", align: "right", cell: (r) => <span className="whitespace-nowrap">{pointsText(r) ?? ""}</span> },
];

export interface IssuesTableProps {
  issues: WorkbookRowReport[];
  levelId: LevelId;
  today: string;
}

/** WARNING / ERROR rows of the preview, filterable by sheet and severity, exportable to Excel. */
export function IssuesTable({ issues, levelId, today }: IssuesTableProps) {
  const [filter, setFilter] = useState<IssueFilter>({ sheet: "ALL", severity: "ALL" });
  const [exporting, setExporting] = useState(false);
  const sorted = useMemo(() => sortIssues(issues), [issues]);
  const sheets = useMemo(() => issueSheets(issues), [issues]);
  const counts = useMemo(() => severityCounts(issues), [issues]);
  const rows = useMemo(() => filterIssues(sorted, filter), [sorted, filter]);

  async function exportIssues() {
    setExporting(true);
    try {
      const { exportSimpleSheet } = await import("@/lib/excel");
      const bytes = await exportSimpleSheet(`Kết quả kiểm tra file nhập – ${levelId}`, ISSUE_EXPORT_COLUMNS, issueExportRows(rows), {
        sheetName: "Kiểm tra",
        subtitle: `Xuất ngày ${fmtDate(today)} · ${fmtNumber(rows.length)} dòng`,
      });
      downloadBlob(bytes, `NSHM_KiemTraNhap_${levelId}_${today}.xlsx`, MIME.xlsx);
      toast.success("Đã xuất danh sách cảnh báo/lỗi");
    } catch (err) {
      toast.error(errorMessage(err, "Chưa xuất được file. Vui lòng thử lại."));
    } finally {
      setExporting(false);
    }
  }

  if (issues.length === 0) {
    return <EmptyState size="sm" icon={ShieldCheck} tone="ok" title="Không có cảnh báo hay lỗi" description="Mọi dòng trong các phần đã chọn đều hợp lệ." />;
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 px-4 pb-3 sm:px-5 md:flex-row md:items-center" data-print-hide>
        <Select
          options={sheets.map((s) => ({ value: s, label: `${s} · ${fmtNumber(issues.filter((i) => i.sheet === s).length)}` }))}
          value={filter.sheet === "ALL" ? undefined : filter.sheet}
          onChange={(v) => setFilter((f) => ({ ...f, sheet: v ?? "ALL" }))}
          placeholder="Tất cả các trang"
          allowEmpty
          aria-label="Lọc theo trang"
          wrapperClassName="md:w-60"
        />
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1" role="group" aria-label="Lọc theo mức độ">
          <Pill active={filter.severity === "ALL"} onClick={() => setFilter((f) => ({ ...f, severity: "ALL" }))}>
            Tất cả · {fmtNumber(issues.length)}
          </Pill>
          <Pill tone="bad" active={filter.severity === "ERROR"} disabled={counts.ERROR === 0} onClick={() => setFilter((f) => ({ ...f, severity: f.severity === "ERROR" ? "ALL" : "ERROR" }))}>
            Lỗi · {fmtNumber(counts.ERROR)}
          </Pill>
          <Pill tone="warn" active={filter.severity === "WARNING"} disabled={counts.WARNING === 0} onClick={() => setFilter((f) => ({ ...f, severity: f.severity === "WARNING" ? "ALL" : "WARNING" }))}>
            Cảnh báo · {fmtNumber(counts.WARNING)}
          </Pill>
        </div>
        <Button variant="secondary" size="sm" icon={Download} loading={exporting} disabled={rows.length === 0} onClick={() => void exportIssues()} className="md:ml-auto">
          Xuất Excel
        </Button>
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => `${r.sheet}-${r.rowNumber}-${r.key}`}
        pageSize={50}
        stickyHeader
        maxHeight="60vh"
        dense
        caption="Các dòng có cảnh báo hoặc lỗi"
        rowClassName={(r) => (r.severity === "ERROR" ? "bg-bad-soft/30" : undefined)}
        mobileCard={(r) => (
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-slate-500">
                {r.sheet} · dòng {fmtNumber(r.rowNumber)}
                {r.key ? ` · ${r.key}` : ""}
              </span>
              <SeverityBadge severity={r.severity} />
            </div>
            <div className="text-[13px] leading-relaxed text-slate-700">
              <Messages r={r} />
            </div>
            {pointsText(r) ? <span className="num text-xs text-slate-500">Điểm trong file → theo quy định: {pointsText(r)}</span> : null}
          </div>
        )}
        emptyState={<EmptyState size="sm" title="Không có dòng phù hợp bộ lọc" />}
      />
    </div>
  );
}
