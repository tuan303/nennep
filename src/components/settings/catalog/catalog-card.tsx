"use client";
import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Badge, Button, Field, Input, SegmentedControl, Switch, Textarea, cn } from "@/components/ui";
import { PenaltyPill } from "@/components/app/widgets";
import type { Unit } from "@/lib/types";
import { parseNumberText } from "../lib/draft";
import type { CatalogRow } from "../lib/catalog-edit";
import { UNIT_OPTIONS, type CatalogEditorApi } from "./catalog-columns";

/** Phone view of one catalog item: summary row that expands into the edit form. */
export function CatalogCard({ row, api }: { row: CatalogRow; api: CatalogEditorApi }) {
  const errors = api.errors[row.key] ?? {};
  const hasErrors = Object.keys(errors).length > 0;
  const [open, setOpen] = useState(row.isNew || api.focusKey === row.key);
  const expanded = open || hasErrors;
  const penalty = parseNumberText(row.penaltyText);
  const panelId = `cat-${row.key}`;

  return (
    <div className={cn("flex flex-col gap-3", !row.active && "opacity-80")}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setOpen(!expanded)}
        className="-m-1 flex min-h-11 items-start gap-3 rounded-control p-1 text-left focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span className="num mt-0.5 inline-flex h-7 min-w-11 items-center justify-center rounded-lg bg-brand-50 px-1.5 text-[13px] font-bold text-brand-800">
          {row.code || "Mới"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold text-slate-900">{row.issue || "Lỗi mới – chưa có nội dung"}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {penalty !== undefined ? <PenaltyPill penalty={penalty} unit={row.unit} /> : null}
            {row.is5S ? (
              <Badge tone="ok" size="sm">
                5S
              </Badge>
            ) : null}
            {!row.active ? (
              <Badge tone="muted" size="sm">
                Ngừng dùng
              </Badge>
            ) : null}
            {hasErrors ? (
              <Badge tone="bad" size="sm">
                Cần sửa
              </Badge>
            ) : null}
            <span className="truncate text-xs text-slate-500">{row.category}</span>
          </span>
        </span>
        <ChevronDown aria-hidden className={cn("mt-1 size-5 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div id={panelId} className="grid grid-cols-2 gap-3 rounded-control bg-surface-2 p-3 ring-1 ring-inset ring-border">
          {row.isNew ? (
            <Field label="Mã lỗi" required error={errors.code}>
              <Input
                value={row.code}
                onChange={(e) => api.update(row.key, { code: e.target.value.toUpperCase() })}
                maxLength={20}
                disabled={api.disabled}
                className="num"
              />
            </Field>
          ) : null}
          <Field label="Mức trừ" required error={errors.penaltyText} className={row.isNew ? undefined : "col-span-1"}>
            <Input
              value={row.penaltyText}
              onChange={(e) => api.update(row.key, { penaltyText: e.target.value.replace(/[^\d.,]/g, "") })}
              inputMode="decimal"
              disabled={api.disabled}
              className="num font-semibold"
            />
          </Field>
          <Field label="Đơn vị tính" hint={row.unit === "/HS" ? "Nhân với số học sinh" : "Nhân với số lần"} className={row.isNew ? "col-span-2" : undefined}>
            <SegmentedControl<Unit>
              options={UNIT_OPTIONS.map((o) => ({ ...o, disabled: api.disabled }))}
              value={row.unit}
              onChange={(v) => api.update(row.key, { unit: v })}
              fullWidth
              ariaLabel="Đơn vị tính"
            />
          </Field>
          <Field label="Nội dung lỗi" required error={errors.issue} className="col-span-2">
            <Textarea
              value={row.issue}
              onChange={(e) => api.update(row.key, { issue: e.target.value })}
              rows={2}
              disabled={api.disabled}
              className="min-h-16"
            />
          </Field>
          <Field label="Mảng" required error={errors.category} className="col-span-2">
            <Input value={row.category} onChange={(e) => api.update(row.key, { category: e.target.value })} list={api.categoryListId} disabled={api.disabled} />
          </Field>
          <Field label="Nhóm" error={errors.group} className="col-span-2">
            <Input value={row.group} onChange={(e) => api.update(row.key, { group: e.target.value })} placeholder="Nhóm 1" disabled={api.disabled} />
          </Field>
          <div className="col-span-2 flex flex-col divide-y divide-border">
            <Switch checked={row.is5S} onChange={(v) => api.update(row.key, { is5S: v })} label="Tính vào theo dõi 5S" disabled={api.disabled} />
            <Switch
              checked={row.active}
              onChange={(v) => api.update(row.key, { active: v })}
              label="Đang dùng"
              description="Tắt để ẩn khỏi danh sách chọn lỗi; dữ liệu cũ giữ nguyên."
              disabled={api.disabled}
            />
          </div>
          {row.isNew ? (
            <Button variant="ghost" icon={Trash2} onClick={() => api.remove(row.key)} disabled={api.disabled} className="col-span-2 text-bad-strong">
              Bỏ dòng mới này
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
