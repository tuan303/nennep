"use client";
import { useMemo } from "react";
import { CircleX, FilePlus2, FileX2, PencilLine, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { Badge, Button, DataTable, KpiCard, cn, type DataTableColumn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { WorkbookPreview } from "@/lib/contract";
import { LEVELS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";
import { Notice } from "@/components/data-inspect/notice";
import { IssuesTable } from "./issues-table";
import { previewSectionRows, previewTotals, type ImportOptions, type SectionKey, type SectionRow } from "./lib/import-model";

function n(v: number, tone?: string) {
  return <span className={cn("num", v === 0 ? "text-slate-300" : tone)}>{fmtNumber(v)}</span>;
}

const COLUMNS: ReadonlyArray<DataTableColumn<SectionRow>> = [
  {
    key: "section",
    header: "Phần dữ liệu",
    cell: (r) => (
      <span className="flex flex-col">
        <span className="flex items-center gap-2 font-semibold text-slate-800">
          {r.label}
          {!r.selected ? (
            <Badge tone="muted" size="sm" variant="outline">
              Không nhập
            </Badge>
          ) : null}
        </span>
        <span className="text-xs text-slate-500">Trang “{r.sheet}”</span>
      </span>
    ),
  },
  { key: "total", header: "Tổng", align: "right", cell: (r) => n(r.selected ? r.summary.total : r.fileCount, "font-semibold text-slate-800") },
  { key: "ok", header: "Hợp lệ", align: "right", cell: (r) => n(r.summary.ok, "text-ok-strong") },
  { key: "warning", header: "Cảnh báo", align: "right", cell: (r) => n(r.summary.warning, "font-semibold text-warn-strong") },
  { key: "error", header: "Lỗi", align: "right", cell: (r) => n(r.summary.error, "font-semibold text-bad-strong") },
  { key: "create", header: "Sẽ tạo", align: "right", cell: (r) => n(r.summary.willCreate, "font-semibold text-brand-800") },
  { key: "update", header: "Sẽ cập nhật", align: "right", cell: (r) => n(r.summary.willUpdate, "font-semibold text-brand-800") },
  { key: "skip", header: "Bỏ qua", align: "right", cell: (r) => n(r.selected ? r.summary.willSkip : r.fileCount, "text-slate-600") },
];

function SectionCard({ r }: { r: SectionRow }) {
  const s = r.summary;
  const cells: Array<[string, number, string]> = [
    ["Tổng", r.selected ? s.total : r.fileCount, "text-slate-800"],
    ["Hợp lệ", s.ok, "text-ok-strong"],
    ["Cảnh báo", s.warning, "text-warn-strong"],
    ["Lỗi", s.error, "text-bad-strong"],
    ["Sẽ tạo", s.willCreate, "text-brand-800"],
    ["Cập nhật", s.willUpdate, "text-brand-800"],
    ["Bỏ qua", r.selected ? s.willSkip : r.fileCount, "text-slate-600"],
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-800">{r.label}</span>
        {!r.selected ? (
          <Badge tone="muted" size="sm" variant="outline">
            Không nhập
          </Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-4 gap-x-2 gap-y-1.5">
        {cells.map(([label, v, color]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-2xs text-slate-500">{label}</dt>
            <dd className={cn("num text-sm font-bold", v === 0 ? "text-slate-300" : color)}>{fmtNumber(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface PreviewResultProps {
  preview: WorkbookPreview;
  options: ImportOptions;
  counts: Record<SectionKey, number>;
  /** Options changed after this preview → it must be re-run before committing. */
  stale: boolean;
  /** The server reported that data changed since the preview (409). */
  conflict: boolean;
  levelId: LevelId;
  today: string;
  busy: boolean;
  onRerun: () => void;
  onCommit: () => void;
}

/** Step 3: totals, per-section summary, WARNING/ERROR rows and the commit action. */
export function PreviewResult({ preview, options, counts, stale, conflict, levelId, today, busy, onRerun, onCommit }: PreviewResultProps) {
  const totals = useMemo(() => previewTotals(preview, options), [preview, options]);
  const rows = useMemo(() => previewSectionRows(preview, options, counts), [preview, options, counts]);
  const writes = totals.willCreate + totals.willUpdate;
  const blocked = stale || conflict;

  return (
    <div className="flex flex-col gap-4">
      {conflict ? (
        <Notice
          tone="warn"
          role="alert"
          title="Dữ liệu trên hệ thống đã thay đổi kể từ lúc kiểm tra"
          action={
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={busy} onClick={onRerun}>
              Kiểm tra lại
            </Button>
          }
        >
          Có người vừa cập nhật dữ liệu của cấp học. Hãy chạy lại bước kiểm tra để xem kết quả mới nhất trước khi nhập.
        </Notice>
      ) : stale ? (
        <Notice
          tone="warn"
          title="Lựa chọn đã thay đổi sau lần kiểm tra"
          action={
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={busy} onClick={onRerun}>
              Kiểm tra lại
            </Button>
          }
        >
          Kết quả bên dưới ứng với lựa chọn cũ.
        </Notice>
      ) : null}

      <Notice tone="brand" title="Cách hệ thống xử lý">
        Dòng <strong>LỖI</strong> sẽ không được nhập; dòng <strong>CẢNH BÁO</strong> được nhập ở trạng thái <strong>Cần rà soát</strong>. Bản ghi đã có (cùng mã)
        được cập nhật, bản ghi giống hệt được bỏ qua – nhập lại cùng file không tạo trùng.
      </Notice>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Sẽ tạo mới" value={totals.willCreate} icon={FilePlus2} tone="ok" />
        <KpiCard label="Sẽ cập nhật" value={totals.willUpdate} icon={PencilLine} tone="brand" />
        <KpiCard label="Bỏ qua" value={totals.willSkip} icon={FileX2} tone="muted" hint="Dòng lỗi và dòng giống hệt dữ liệu đang có." />
        <KpiCard label="Cảnh báo" value={totals.warning} icon={TriangleAlert} tone="warn" />
        <KpiCard label="Lỗi" value={totals.error} icon={CircleX} tone="bad" className="max-sm:col-span-2" />
      </div>

      <div className="overflow-hidden rounded-card ring-1 ring-border">
        <DataTable columns={COLUMNS} rows={rows} rowKey={(r) => r.key} mobileCard={(r) => <SectionCard r={r} />} dense caption="Tóm tắt theo phần dữ liệu" rowClassName={(r) => (r.selected ? undefined : "opacity-60")} />
      </div>

      <section className="flex flex-col gap-3 overflow-hidden rounded-card pt-4 ring-1 ring-border" aria-labelledby="import-issues-title">
        <h3 id="import-issues-title" className="px-4 text-[15px] font-semibold text-brand-900 sm:px-5">
          Dòng cần chú ý <span className="num text-sm font-medium text-slate-500">({fmtNumber(preview.issues.length)})</span>
        </h3>
        <IssuesTable issues={preview.issues} levelId={levelId} today={today} />
      </section>

      <div className="flex flex-col gap-2 rounded-card bg-surface-2 px-4 py-3 ring-1 ring-inset ring-border sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-slate-600">
          {writes > 0 ? (
            <>
              Sẽ ghi <strong className="num text-slate-900">{fmtNumber(writes)}</strong> bản ghi vào cấp {LEVELS[levelId].short}
              {totals.error > 0 ? ` · bỏ qua ${fmtNumber(totals.error)} dòng lỗi` : ""}.
            </>
          ) : (
            "Không có dữ liệu mới hoặc thay đổi để nhập."
          )}
        </p>
        <Button variant="gold" icon={Upload} disabled={blocked || busy || writes === 0} onClick={onCommit}>
          Xác nhận nhập
        </Button>
      </div>
    </div>
  );
}
