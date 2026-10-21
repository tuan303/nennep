"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, Mail, Pencil, Phone, Plus, School, SearchX } from "lucide-react";
import { Badge, Button, Card, DataTable, EmptyState, IconButton, SearchInput, Select, Switch, toast, type DataTableColumn } from "@/components/ui";
import { api, errorMessage, validationIssues } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import type { LevelDataset } from "@/lib/types";
import { changeSummaryText } from "../lib/catalog-edit";
import {
  classChanges,
  classesPayload,
  filterClassRows,
  newClassRow,
  renumberClassOrder,
  rowsFromClasses,
  validateClassRows,
  type ClassRow,
} from "../lib/classes-edit";
import { countRowErrors, parseIntText } from "../lib/draft";
import { Notice, ServerErrors } from "../shared/notice";
import { SaveBar } from "../shared/save-bar";
import { StaleNotice, useReportDirty } from "../shared/settings-context";
import { useDraft } from "../shared/use-draft";
import { CardActions } from "../shared/card-actions";
import { ClassEditSheet } from "./class-edit-sheet";

/** Tab "Lớp & GVCN": class list edited in a sheet, saved as a whole list. */
export function ClassesTab({ ds }: { ds: LevelDataset }) {
  const { refresh } = useDataset(ds.levelId);
  const source = useMemo(() => rowsFromClasses(ds.classes), [ds.classes]);
  const { draft: rows, setDraft, base, dirty, stale, reset, reload, markSaved } = useDraft<ClassRow[]>(source);
  const [grade, setGrade] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverMessages, setServerMessages] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  useReportDirty("lop", dirty);

  const errors = useMemo(() => validateClassRows(rows, ds.levelId), [rows, ds.levelId]);
  const errorCount = countRowErrors(errors);
  const visible = useMemo(() => filterClassRows(rows, { grade: grade ? Number(grade) : undefined, query }), [rows, grade, query]);
  const changes = classChanges(rows, base);
  const active = rows.filter((r) => r.active);
  const withEmail = active.filter((r) => r.homeroomEmail.trim()).length;
  const totalSize = active.reduce((s, r) => s + (parseIntText(r.sourceSizeText) ?? 0), 0);

  const patchRow = useCallback(
    (key: string, patch: Partial<ClassRow>) => {
      setDraft((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
      setServerMessages([]);
    },
    [setDraft],
  );

  function apply(row: ClassRow) {
    setDraft((rs) => (rs.some((r) => r.key === row.key) ? rs.map((r) => (r.key === row.key ? row : r)) : [...rs, row]));
    setServerMessages([]);
    setEditing(null);
  }

  async function save() {
    if (errorCount > 0) {
      const first = rows.find((r) => errors[r.key]);
      if (first) setEditing(first);
      toast.error("Chưa lưu được", { description: `Còn ${errorCount} ô cần sửa trong danh sách lớp.` });
      return;
    }
    setSaving(true);
    try {
      await api.settings.putClasses(ds.levelId, classesPayload(rows));
      markSaved();
      toast.success("Đã lưu danh sách lớp", { description: changeSummaryText(changes, { item: "lớp" }) || undefined });
      await refresh();
    } catch (err) {
      setServerMessages(validationIssues(err).map((i) => i.message));
      toast.error("Chưa lưu được danh sách lớp", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  function undo() {
    const previous = rows;
    reset();
    setServerMessages([]);
    toast("Đã hoàn tác thay đổi", { action: { label: "Làm lại", onClick: () => setDraft(previous) } });
  }

  const columns: DataTableColumn<ClassRow>[] = [
    {
      key: "order",
      header: "TT",
      width: 56,
      align: "right",
      cell: (r) => <span className="text-slate-500">{r.orderText}</span>,
      sortValue: (r) => parseIntText(r.orderText) ?? 0,
    },
    {
      key: "code",
      header: "Lớp",
      width: 132,
      sortValue: (r) => r.code,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="num font-semibold text-brand-900">{r.code || "–"}</span>
          {r.system ? <span className="text-xs text-slate-500">{r.system}</span> : null}
          <RowBadges row={r} invalid={!!errors[r.key]} />
        </div>
      ),
    },
    { key: "grade", header: "Khối", width: 80, cell: (r) => `Khối ${r.grade}`, sortValue: (r) => r.grade },
    {
      key: "teacher",
      header: "GVCN",
      cell: (r) => (
        <div className="min-w-44 max-w-md">
          <p className="line-clamp-2 text-slate-800">{r.homeroomTeacher || <span className="text-slate-400">Chưa có GVCN</span>}</p>
          {r.deputyTeacher ? <p className="mt-0.5 truncate text-xs text-slate-500">Phó CN: {r.deputyTeacher}</p> : null}
        </div>
      ),
    },
    { key: "contact", header: "Liên hệ", cell: (r) => <Contact row={r} /> },
    { key: "size", header: "Sĩ số", width: 72, align: "right", cell: (r) => r.sourceSizeText || "–", sortValue: (r) => parseIntText(r.sourceSizeText) ?? -1 },
    {
      key: "active",
      header: "Hoạt động",
      width: 96,
      align: "center",
      cell: (r) => (
        <Switch size="sm" checked={r.active} onChange={(v) => patchRow(r.key, { active: v })} aria-label={`Lớp ${r.code} đang hoạt động`} disabled={saving} />
      ),
    },
    {
      key: "edit",
      header: <span className="sr-only">Sửa</span>,
      headerLabel: "Sửa",
      width: 56,
      align: "center",
      cell: (r) => <IconButton icon={Pencil} label={`Sửa lớp ${r.code}`} size="sm" onClick={() => setEditing(r)} disabled={saving} />,
    },
  ];

  const gradeOptions = LEVELS[ds.levelId].grades.map((g) => ({ value: String(g), label: `Khối ${g}` }));
  const filtered = !!grade || !!query;

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {stale ? <StaleNotice onReload={reload} /> : null}
      <ServerErrors messages={serverMessages} />
      <Card
        padding="none"
        icon={School}
        title="Lớp & GVCN"
        subtitle={`${active.length} lớp đang hoạt động · ${withEmail} lớp có email GVCN · tổng sĩ số ${fmtNumber(totalSize)}`}
        actions={
          <CardActions>
            <Button variant="ghost" size="sm" icon={ArrowDownWideNarrow} onClick={() => setDraft((rs) => renumberClassOrder(rs))} disabled={saving}>
              Đánh lại thứ tự
            </Button>
            <Button icon={Plus} onClick={() => setEditing(newClassRow(rows, ds.levelId, grade ? Number(grade) : undefined))} disabled={saving}>
              Thêm lớp
            </Button>
          </CardActions>
        }
      >
        <div className="flex flex-col gap-3 border-b border-border px-4 pb-4 sm:flex-row sm:items-center sm:px-5">
          <Select
            options={gradeOptions}
            value={grade}
            onChange={setGrade}
            placeholder="Tất cả khối"
            allowEmpty
            aria-label="Lọc theo khối"
            wrapperClassName="sm:w-48"
          />
          <div className="min-w-0 flex-1">
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm lớp, tên GVCN hoặc email…" ariaLabel="Tìm lớp" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(r) => r.key}
          caption="Danh sách lớp và GVCN"
          rowClassName={(r) => (!r.active ? "bg-surface-2" : r.isNew ? "bg-star-50/60" : undefined)}
          mobileCard={(r) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="num text-base font-bold text-brand-900">{r.code || "Lớp mới"}</span>
                    <span className="text-[13px] text-slate-500">
                      Khối {r.grade}
                      {r.system ? ` · ${r.system}` : ""}
                    </span>
                  </p>
                  <RowBadges row={r} invalid={!!errors[r.key]} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch checked={r.active} onChange={(v) => patchRow(r.key, { active: v })} aria-label={`Lớp ${r.code} đang hoạt động`} disabled={saving} />
                  <IconButton icon={Pencil} label={`Sửa lớp ${r.code}`} onClick={() => setEditing(r)} disabled={saving} />
                </div>
              </div>
              <p className="line-clamp-2 text-sm text-slate-800">{r.homeroomTeacher || <span className="text-slate-400">Chưa có GVCN</span>}</p>
              <Contact row={r} />
            </div>
          )}
          emptyState={
            <EmptyState
              size="sm"
              icon={SearchX}
              title={filtered ? "Không có lớp phù hợp" : "Chưa có lớp nào"}
              description={filtered ? "Thử đổi khối hoặc từ khóa." : "Bấm “Thêm lớp” hoặc nhập danh sách lớp từ file Excel."}
            />
          }
        />
      </Card>
      <Notice tone="brand">
        Lớp ngừng hoạt động được ẩn khỏi danh sách chọn và bảng xếp hạng; sự việc cũ của lớp vẫn giữ nguyên. Email GVCN dùng cho chức năng “Tạo tài khoản GVCN
        hàng loạt” ở mục Người dùng.
      </Notice>

      <ClassEditSheet row={editing} rows={rows} levelId={ds.levelId} onApply={apply} onClose={() => setEditing(null)} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        errorCount={errorCount}
        summary={changeSummaryText(changes, { item: "lớp" })}
        onSave={() => void save()}
        onReset={undo}
      />
    </div>
  );
}

function RowBadges({ row, invalid }: { row: ClassRow; invalid: boolean }) {
  if (!row.isNew && row.active && !invalid) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {row.isNew ? (
        <Badge tone="star" size="sm">
          Mới
        </Badge>
      ) : null}
      {!row.active ? (
        <Badge tone="muted" size="sm">
          Ngừng hoạt động
        </Badge>
      ) : null}
      {invalid ? (
        <Badge tone="bad" size="sm">
          Cần sửa
        </Badge>
      ) : null}
    </span>
  );
}

function Contact({ row }: { row: ClassRow }) {
  if (!row.homeroomPhone && !row.homeroomEmail) return <span className="text-[13px] text-slate-400">Chưa có liên hệ</span>;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-[13px] text-slate-600">
      {row.homeroomPhone ? (
        <span className="num flex items-center gap-1.5">
          <Phone aria-hidden className="size-3.5 shrink-0 text-slate-400" />
          {row.homeroomPhone}
        </span>
      ) : null}
      {row.homeroomEmail ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <Mail aria-hidden className="size-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{row.homeroomEmail}</span>
        </span>
      ) : null}
    </div>
  );
}
