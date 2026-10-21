"use client";
import { useEffect, useMemo, useRef } from "react";
import { ArrowLeftRight, CircleAlert, CircleCheck, Equal, PencilLine, RotateCcw, SearchX, UserMinus, UserPlus, type LucideIcon } from "lucide-react";
import { Badge, Card, Checkbox, DataTable, EmptyState, SearchInput, Select, cn, toneTile, type DataTableColumn } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { StudentImportPreview, StudentImportRowKind } from "@/lib/contract";
import type { StudentLite } from "@/lib/types";
import { filterPreviewRows, isLevelChangeRow, previewTiles, type ImportMode, type PreviewFilter, type PreviewRow } from "../lib/import-wizard";
import { IMPORT_KIND_META, IMPORT_KIND_ORDER, type ImportTileKind } from "../lib/labels";
import { Callout } from "../parts";

export const KIND_ICONS: Record<ImportTileKind, LucideIcon> = {
  NEW: UserPlus,
  UPDATE: PencilLine,
  TRANSFER: ArrowLeftRight,
  REINSTATE: RotateCcw,
  UNCHANGED: Equal,
  INVALID: CircleAlert,
  MISSING: UserMinus,
};

export interface StepPreviewProps {
  preview: StudentImportPreview;
  mode: ImportMode;
  effectiveDate: string;
  filter: PreviewFilter;
  query: string;
  applyMissing: boolean;
  conflict: boolean;
  onFilter: (f: PreviewFilter) => void;
  onQuery: (q: string) => void;
  onApplyMissing: (v: boolean) => void;
}

/** Step 3: what the import will do – summary tiles (also filters), the row table, and (sync) students missing from the file. */
export function StepPreview(p: StepPreviewProps) {
  const { preview, mode, filter, query } = p;
  const missingRef = useRef<HTMLElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  // A 409 on commit shows the banner at the top: bring it into view.
  useEffect(() => {
    if (p.conflict) conflictRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [p.conflict]);
  const tiles = useMemo(() => previewTiles(preview, mode), [preview, mode]);
  const rows = useMemo(() => filterPreviewRows(preview.rows, filter, query), [preview.rows, filter, query]);
  const filterOptions = useMemo(
    () => [
      { value: "CHANGES" as PreviewFilter, label: "Có thay đổi hoặc lỗi" },
      { value: "ALL" as PreviewFilter, label: `Tất cả dòng (${fmtNumber(preview.summary.total)})` },
      ...IMPORT_KIND_ORDER.map((k) => ({ value: k as PreviewFilter, label: `${IMPORT_KIND_META[k].label} (${fmtNumber(preview.summary[k])})` })),
    ],
    [preview.summary],
  );

  return (
    <div className="flex flex-col gap-4">
      {p.conflict ? (
        <div ref={conflictRef} className="scroll-mt-4">
          <Callout tone="warn" title="Dữ liệu học sinh vừa thay đổi">
            Danh sách vừa được cập nhật sau lần kiểm tra này. Hãy bấm “Kiểm tra lại” để xem kết quả mới trước khi cập nhật.
          </Callout>
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Tóm tắt kết quả kiểm tra">
        {tiles.map((t) => {
          const meta = IMPORT_KIND_META[t.kind];
          const Icon = KIND_ICONS[t.kind];
          const selected = filter === t.kind;
          const onClick =
            t.kind === "MISSING"
              ? () => missingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              : () => p.onFilter(selected ? "CHANGES" : (t.kind as StudentImportRowKind));
          return (
            <li key={t.kind}>
              <button
                type="button"
                onClick={onClick}
                aria-pressed={t.kind === "MISSING" ? undefined : selected}
                title={meta.description}
                disabled={t.count === 0}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border bg-surface p-2.5 text-left transition-[border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-default disabled:opacity-55",
                  selected ? "border-brand-500 shadow-raised ring-1 ring-brand-500" : "border-border enabled:hover:border-brand-200",
                )}
              >
                <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset", toneTile[meta.tone])}>
                  <Icon aria-hidden className="size-[18px]" strokeWidth={2.25} />
                </span>
                <span className="min-w-0">
                  <span className="num block text-xl font-bold leading-6 text-brand-900">{fmtNumber(t.count)}</span>
                  <span className="block truncate text-xs font-medium text-slate-600">{meta.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Card padding="none">
        <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
          <SearchInput value={query} onChange={p.onQuery} placeholder="Tìm mã HS, họ tên, lớp…" ariaLabel="Tìm trong kết quả kiểm tra" />
          <Select<PreviewFilter> aria-label="Lọc dòng" options={filterOptions} value={filter} onChange={(v) => p.onFilter(v ?? "CHANGES")} />
        </div>
        <PreviewTable rows={rows} />
      </Card>

      {mode === "sync" ? (
        <section ref={missingRef} aria-labelledby="missing-title" className="scroll-mt-4">
          <MissingStudents missing={preview.missing} effectiveDate={p.effectiveDate} checked={p.applyMissing} onChange={p.onApplyMissing} />
        </section>
      ) : null}
    </div>
  );
}

const PREVIEW_COLUMNS: DataTableColumn<PreviewRow>[] = [
  { key: "row", header: "Dòng", width: 56, align: "right", sortValue: (r) => r.rowNumber ?? null, cell: (r) => <span className="text-slate-500">{r.rowNumber ?? "–"}</span> },
  {
    key: "student",
    header: "Học sinh",
    width: "34%",
    sortValue: (r) => r.name,
    cell: (r) => (
      <div className="min-w-0">
        <p className="font-semibold leading-5 text-slate-900">{r.name || "(Thiếu họ tên)"}</p>
        <p className="num text-xs text-slate-500">
          {r.id || "Thiếu mã"} · Lớp {r.classCode || "–"}
        </p>
      </div>
    ),
  },
  { key: "kind", header: "Kết quả", width: 150, sortValue: (r) => IMPORT_KIND_ORDER.indexOf(r.kind), cell: (r) => <KindBadge row={r} /> },
  { key: "detail", header: "Chi tiết", cell: (r) => <RowDetail row={r} /> },
];

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <DataTable
      columns={PREVIEW_COLUMNS}
      rows={rows}
      rowKey={(r) => `${r.rowNumber ?? ""}-${r.id}`}
      pageSize={50}
      dense
      caption="Kết quả kiểm tra từng dòng"
      emptyState={<EmptyState size="sm" icon={SearchX} title="Không có dòng phù hợp" description="Đổi bộ lọc hoặc từ khóa tìm kiếm." />}
      mobileCard={(r) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-semibold text-slate-900">{r.name || "(Thiếu họ tên)"}</p>
            <KindBadge row={r} />
          </div>
          <p className="num text-xs text-slate-500">
            Dòng {r.rowNumber ?? "–"} · {r.id || "Thiếu mã"} · Lớp {r.classCode || "–"}
          </p>
          <RowDetail row={r} />
        </div>
      )}
    />
  );
}

function KindBadge({ row }: { row: Pick<PreviewRow, "kind" | "changes"> }) {
  const kind: StudentImportRowKind = row.kind;
  const meta = IMPORT_KIND_META[kind];
  return (
    <Badge tone={meta.tone} size="sm" icon={KIND_ICONS[kind]}>
      {isLevelChangeRow(row) ? "Chuyển cấp" : meta.label}
    </Badge>
  );
}

function RowDetail({ row }: { row: PreviewRow }) {
  if (row.errors.length > 0)
    return (
      <ul className="flex flex-col gap-0.5 text-[13px] font-medium text-bad-strong">
        {row.errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    );
  if (row.changes.length > 0)
    return (
      <ul className="num flex flex-col gap-0.5 text-[13px] text-slate-700">
        {row.changes.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    );
  return <span className="text-[13px] text-slate-400">{row.kind === "NEW" ? "Thêm mới" : "–"}</span>;
}

const MISSING_COLUMNS: DataTableColumn<StudentLite>[] = [
  { key: "id", header: "Mã HS", width: 110, sortValue: (s) => s.id, cell: (s) => <span className="num font-medium">{s.id}</span> },
  { key: "name", header: "Họ và tên", sortValue: (s) => s.name, cell: (s) => <span className="font-semibold text-slate-900">{s.name}</span> },
  { key: "class", header: "Lớp", width: 80, sortValue: (s) => s.classCode, cell: (s) => <span className="num">{s.classCode}</span> },
  { key: "dob", header: "Ngày sinh", width: 110, cell: (s) => <span className="num">{s.dob ? fmtDate(s.dob) : "–"}</span> },
];

function MissingStudents({ missing, effectiveDate, checked, onChange }: { missing: StudentLite[]; effectiveDate: string; checked: boolean; onChange: (v: boolean) => void }) {
  if (missing.length === 0) {
    return (
      <Card padding="sm">
        <p id="missing-title" className="flex items-center gap-2 text-[13px] font-medium text-ok-strong">
          <CircleCheck aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
          Mọi học sinh đang học đều có trong file.
        </p>
      </Card>
    );
  }
  return (
    <Card padding="none" title={<span id="missing-title">Học sinh không có trong file ({fmtNumber(missing.length)})</span>} subtitle="Đang học nhưng không xuất hiện trong file vừa tải lên.">
      <div className={cn("border-y border-border px-4 py-2 sm:px-5", checked ? "bg-warn-soft/60" : "bg-surface-2")}>
        <Checkbox
          checked={checked}
          onChange={onChange}
          label={`Đánh dấu ${fmtNumber(missing.length)} học sinh này là Đã chuyển trường`}
          description={`Ngày rời trường ${fmtDate(effectiveDate)}, lý do “Không có trong danh sách import”. Có thể khôi phục từng em sau.`}
        />
      </div>
      <DataTable
        columns={MISSING_COLUMNS}
        rows={missing}
        rowKey={(s) => s.id}
        pageSize={20}
        dense
        caption="Học sinh không có trong file"
        mobileCard={(s) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{s.name}</p>
            <p className="num text-xs text-slate-500">
              {s.id} · Lớp {s.classCode}
            </p>
          </div>
        )}
      />
    </Card>
  );
}

