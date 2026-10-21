"use client";
/** Filter bar of the audit log: Hành động · Email · Cấp học · Từ ngày / Đến ngày; "Lọc" applies (Enter too). */
import { useMemo, type FormEvent } from "react";
import { CircleAlert, Filter, ListFilter, RotateCcw } from "lucide-react";
import { Button, Card, Combobox, DateInput, Field, Pill, SearchInput, Select, type ComboOption } from "@/components/ui";
import { LEVELS, LEVEL_IDS } from "@/lib/constants";
import type { AuditAction, LevelId } from "@/lib/types";
import { auditActionOptions } from "./lib/audit-labels";
import { DATE_PRESETS, activeAuditFilterCount, presetOf, presetRange, type AuditFilterForm } from "./lib/audit-query";

const LEVEL_OPTIONS = LEVEL_IDS.map((l) => ({ value: l, label: LEVELS[l].name }));

export interface AuditFiltersProps {
  form: AuditFilterForm;
  onChange: (patch: Partial<AuditFilterForm>) => void;
  onApply: () => void;
  onReset: () => void;
  today: string;
  /** Form differs from the applied filter. */
  pending: boolean;
  error?: string;
  loading?: boolean;
}

export function AuditFilters({ form, onChange, onApply, onReset, today, pending, error, loading }: AuditFiltersProps) {
  const actionOptions = useMemo<ComboOption<AuditAction>[]>(() => auditActionOptions(), []);
  const preset = presetOf(form, today);
  const count = activeAuditFilterCount(form);

  function submit(e: FormEvent) {
    e.preventDefault();
    onApply();
  }

  return (
    <Card padding="sm" data-print-hide>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5" aria-label="Bộ lọc nhật ký">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-12">
          <Field label="Hành động" className="col-span-2 sm:col-span-1 lg:col-span-3">
            <Combobox<AuditAction>
              options={actionOptions}
              value={form.action}
              onChange={(action) => onChange({ action })}
              placeholder="Tất cả hành động"
              searchPlaceholder="Tìm hành động, ví dụ: đăng nhập"
              title="Chọn hành động"
              clearable
              icon={ListFilter}
            />
          </Field>
          <Field label="Email" hint="Email đầy đủ: lọc trên máy chủ. Một phần: lọc trong các dòng đã tải." className="col-span-2 sm:col-span-1 lg:col-span-3">
            <SearchInput value={form.email} onChange={(email) => onChange({ email })} delay={0} placeholder="vd: nennep@nshm.edu.vn" ariaLabel="Email người dùng" />
          </Field>
          <Field label="Cấp học" className="col-span-2 lg:col-span-2">
            <Select<LevelId> options={LEVEL_OPTIONS} value={form.level} onChange={(level) => onChange({ level })} placeholder="Tất cả" allowEmpty />
          </Field>
          <Field label="Từ ngày" className="col-span-1 lg:col-span-2">
            <DateInput value={form.from} onChange={(from) => onChange({ from })} max={form.to || today} invalid={!!error} />
          </Field>
          <Field label="Đến ngày" className="col-span-1 lg:col-span-2">
            <DateInput value={form.to} onChange={(to) => onChange({ to })} min={form.from || undefined} max={today} invalid={!!error} />
          </Field>
        </div>

        {error ? (
          <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-bad-strong">
            <CircleAlert aria-hidden className="size-4" /> {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border pt-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Khoảng thời gian nhanh">
            {DATE_PRESETS.map((p) => (
              <Pill key={p.value} active={preset === p.value} onClick={() => onChange(presetRange(p.value, today))}>
                {p.label}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-2 max-md:[&>*]:flex-1">
            {pending ? <span className="text-xs font-medium text-warn-strong max-md:hidden">Có thay đổi chưa áp dụng</span> : null}
            <Button variant="ghost" icon={RotateCcw} onClick={onReset} disabled={count === 0 && !pending}>
              Xóa lọc
            </Button>
            <Button type="submit" icon={Filter} loading={loading}>
              Lọc
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
