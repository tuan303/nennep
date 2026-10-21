"use client";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { History, ListChecks, Plus, SearchX } from "lucide-react";
import { Button, Card, DataTable, EmptyState, SearchInput, Select, Switch, toast } from "@/components/ui";
import { api, errorMessage, validationIssues } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import type { LevelDataset } from "@/lib/types";
import {
  catalogCategories,
  catalogChanges,
  catalogPayload,
  changeSummaryText,
  filterCatalogRows,
  newCatalogRow,
  rowsFromCatalog,
  validateCatalogRows,
  type CatalogRow,
} from "../lib/catalog-edit";
import { countRowErrors } from "../lib/draft";
import { Notice, ServerErrors } from "../shared/notice";
import { SaveBar } from "../shared/save-bar";
import { StaleNotice, focusFirstInvalid, useReportDirty } from "../shared/settings-context";
import { useDraft } from "../shared/use-draft";
import { CatalogCard } from "./catalog-card";
import { catalogColumns, type CatalogEditorApi } from "./catalog-columns";

/** Tab "Danh mục lỗi": inline-editable table (cards on phones), saved as a whole list. */
export function CatalogTab({ ds }: { ds: LevelDataset }) {
  const { refresh } = useDataset(ds.levelId);
  const source = useMemo(() => rowsFromCatalog(ds.catalog), [ds.catalog]);
  const { draft: rows, setDraft, base, dirty, stale, reset, reload, markSaved } = useDraft<CatalogRow[]>(source);
  const [category, setCategory] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [focusKey, setFocusKey] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [serverMessages, setServerMessages] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const categoryListId = useId();
  useReportDirty("danh-muc", dirty);

  const errors = useMemo(() => validateCatalogRows(rows), [rows]);
  const errorCount = countRowErrors(errors);
  const categories = useMemo(() => catalogCategories(rows), [rows]);
  const visible = useMemo(() => filterCatalogRows(rows, { category, query, showInactive }), [rows, category, query, showInactive]);
  const changes = catalogChanges(rows, base);
  const activeCount = rows.filter((r) => r.active).length;
  const fiveSCount = rows.filter((r) => r.active && r.is5S).length;

  const update = useCallback(
    (key: string, patch: Partial<CatalogRow>) => {
      setDraft((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
      setServerMessages([]);
    },
    [setDraft],
  );
  const remove = useCallback((key: string) => setDraft((rs) => rs.filter((r) => r.key !== key || !r.isNew)), [setDraft]);

  function add() {
    const row = newCatalogRow(rows, category ?? "");
    setDraft((rs) => [row, ...rs]);
    setFocusKey(row.key);
    rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function save() {
    if (errorCount > 0) {
      setCategory(undefined);
      setQuery("");
      setShowInactive(true);
      window.setTimeout(() => focusFirstInvalid(rootRef.current), 50);
      toast.error("Chưa lưu được", { description: `Còn ${errorCount} ô cần sửa trong danh mục.` });
      return;
    }
    setSaving(true);
    try {
      await api.settings.putCatalog(ds.levelId, catalogPayload(rows));
      markSaved();
      toast.success("Đã lưu danh mục lỗi", {
        description: `${changeSummaryText(changes, { item: "lỗi" }) || "Đã cập nhật"}. Sự việc cũ giữ nguyên mức trừ đã ghi.`,
      });
      await refresh();
    } catch (err) {
      setServerMessages(validationIssues(err).map((i) => i.message));
      toast.error("Chưa lưu được danh mục lỗi", { description: errorMessage(err) });
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

  const editor: CatalogEditorApi = { update, remove, errors, categoryListId, disabled: saving, focusKey };
  const columns = catalogColumns(editor);
  const filtered = !!category || !!query || !showInactive;

  return (
    <div ref={rootRef} className="flex scroll-mt-24 flex-col gap-4">
      {stale ? <StaleNotice onReload={reload} /> : null}
      <Notice tone="warn" icon={History} title="Thay đổi chỉ áp dụng cho sự việc ghi nhận sau">
        Sự việc cũ giữ nguyên mức trừ tại thời điểm ghi. Mã lỗi đã lưu không đổi được – để thay thế, tắt “Đang dùng” và thêm mã mới.
      </Notice>
      <ServerErrors messages={serverMessages} />
      <datalist id={categoryListId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <Card
        padding="none"
        icon={ListChecks}
        title="Danh mục lỗi"
        subtitle={`${activeCount} lỗi đang dùng · ${fiveSCount} lỗi tính 5S · ${rows.length - activeCount} ngừng dùng`}
        actions={
          <Button icon={Plus} onClick={add} disabled={saving}>
            Thêm lỗi
          </Button>
        }
      >
        <div className="flex flex-col gap-3 border-b border-border px-4 pb-4 sm:px-5 md:flex-row md:items-center">
          <Select
            options={categories.map((c) => ({ value: c, label: c }))}
            value={category}
            onChange={setCategory}
            placeholder="Tất cả mảng"
            allowEmpty
            aria-label="Lọc theo mảng"
            wrapperClassName="md:w-72"
          />
          <div className="min-w-0 flex-1">
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo mã hoặc nội dung lỗi…" ariaLabel="Tìm lỗi" />
          </div>
          <Switch checked={showInactive} onChange={setShowInactive} label="Hiện lỗi ngừng dùng" className="md:min-h-0" />
        </div>
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(r) => r.key}
          caption="Danh mục lỗi – chỉnh sửa trực tiếp"
          rowClassName={(r) => (r.isNew ? "bg-star-50/60" : !r.active ? "bg-surface-2" : undefined)}
          mobileCard={(r) => <CatalogCard row={r} api={editor} />}
          emptyState={
            <EmptyState
              size="sm"
              icon={SearchX}
              title={filtered ? "Không có lỗi phù hợp" : "Chưa có lỗi trong danh mục"}
              description={filtered ? "Thử đổi mảng hoặc từ khóa tìm kiếm." : "Bấm “Thêm lỗi” để tạo mục đầu tiên."}
              action={
                filtered ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCategory(undefined);
                      setQuery("");
                      setShowInactive(true);
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>

      <SaveBar
        dirty={dirty}
        saving={saving}
        errorCount={errorCount}
        summary={changeSummaryText(changes, { item: "lỗi" })}
        onSave={() => void save()}
        onReset={undo}
      />
    </div>
  );
}
