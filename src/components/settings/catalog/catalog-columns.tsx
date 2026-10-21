"use client";
import { Trash2 } from "lucide-react";
import { Badge, IconButton, Input, SegmentedControl, Switch, Textarea, type DataTableColumn } from "@/components/ui";
import { UNITS } from "@/lib/constants";
import type { Unit } from "@/lib/types";
import type { CatalogField, CatalogRow } from "../lib/catalog-edit";
import type { RowErrors } from "../lib/draft";
import { CellError } from "../shared/notice";

export const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u }));

export interface CatalogEditorApi {
  update: (key: string, patch: Partial<CatalogRow>) => void;
  remove: (key: string) => void;
  errors: RowErrors<CatalogField>;
  categoryListId: string;
  disabled: boolean;
  focusKey?: string;
}

/** Desktop table columns with inline editors (codes of saved items are read-only). */
export function catalogColumns(api: CatalogEditorApi): DataTableColumn<CatalogRow>[] {
  const err = (r: CatalogRow, f: CatalogField) => api.errors[r.key]?.[f];
  return [
    {
      key: "code",
      header: "Mã",
      width: 104,
      cell: (r) =>
        r.isNew ? (
          <div>
            <Input
              value={r.code}
              onChange={(e) => api.update(r.key, { code: e.target.value.toUpperCase() })}
              aria-label="Mã lỗi mới"
              invalid={!!err(r, "code")}
              maxLength={20}
              autoFocus={api.focusKey === r.key}
              disabled={api.disabled}
              className="num font-semibold"
            />
            <CellError message={err(r, "code")} />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <span className="num font-semibold text-brand-900">{r.code}</span>
            {!r.active ? (
              <Badge tone="muted" size="sm">
                Ngừng dùng
              </Badge>
            ) : null}
          </div>
        ),
    },
    {
      key: "category",
      header: "Mảng",
      width: "17%",
      cell: (r) => (
        <div>
          <Input
            value={r.category}
            onChange={(e) => api.update(r.key, { category: e.target.value })}
            list={api.categoryListId}
            aria-label={`Mảng của lỗi ${r.code || "mới"}`}
            invalid={!!err(r, "category")}
            disabled={api.disabled}
          />
          <CellError message={err(r, "category")} />
        </div>
      ),
    },
    {
      key: "issue",
      header: "Nội dung lỗi",
      cell: (r) => (
        <div className="min-w-56">
          <Textarea
            value={r.issue}
            onChange={(e) => api.update(r.key, { issue: e.target.value })}
            rows={1}
            aria-label={`Nội dung lỗi ${r.code || "mới"}`}
            invalid={!!err(r, "issue")}
            disabled={api.disabled}
            className="min-h-10 py-2 leading-snug"
          />
          <CellError message={err(r, "issue")} />
        </div>
      ),
    },
    {
      key: "group",
      header: "Nhóm",
      width: 112,
      cell: (r) => (
        <div>
          <Input
            value={r.group}
            onChange={(e) => api.update(r.key, { group: e.target.value })}
            aria-label={`Nhóm của lỗi ${r.code || "mới"}`}
            placeholder="Nhóm 1"
            invalid={!!err(r, "group")}
            disabled={api.disabled}
          />
          <CellError message={err(r, "group")} />
        </div>
      ),
    },
    {
      key: "penalty",
      header: "Mức trừ",
      width: 92,
      cell: (r) => (
        <div>
          <Input
            value={r.penaltyText}
            onChange={(e) => api.update(r.key, { penaltyText: e.target.value.replace(/[^\d.,]/g, "") })}
            inputMode="decimal"
            aria-label={`Mức trừ của lỗi ${r.code || "mới"}`}
            invalid={!!err(r, "penaltyText")}
            disabled={api.disabled}
            className="num text-right font-semibold"
          />
          <CellError message={err(r, "penaltyText")} />
        </div>
      ),
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 128,
      cell: (r) => (
        <SegmentedControl<Unit>
          options={UNIT_OPTIONS.map((o) => ({ ...o, disabled: api.disabled }))}
          value={r.unit}
          onChange={(v) => api.update(r.key, { unit: v })}
          size="sm"
          ariaLabel={`Đơn vị tính của lỗi ${r.code || "mới"}`}
        />
      ),
    },
    {
      key: "is5S",
      header: "5S",
      width: 64,
      align: "center",
      cell: (r) => (
        <Switch
          size="sm"
          checked={r.is5S}
          onChange={(v) => api.update(r.key, { is5S: v })}
          aria-label={`Tính vào 5S – ${r.code || "lỗi mới"}`}
          disabled={api.disabled}
        />
      ),
    },
    {
      key: "active",
      header: "Đang dùng",
      width: 88,
      align: "center",
      cell: (r) => (
        <Switch
          size="sm"
          checked={r.active}
          onChange={(v) => api.update(r.key, { active: v })}
          aria-label={`Đang dùng – ${r.code || "lỗi mới"}`}
          disabled={api.disabled}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Thao tác</span>,
      headerLabel: "Thao tác",
      width: 56,
      align: "center",
      cell: (r) =>
        r.isNew ? (
          <IconButton icon={Trash2} label={`Bỏ dòng mới ${r.code}`} size="sm" variant="ghost" onClick={() => api.remove(r.key)} disabled={api.disabled} />
        ) : null,
    },
  ];
}
