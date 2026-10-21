"use client";
/**
 * Individual global-filter controls bound to `useFilters()` – composed by FilterBar (desktop row) and
 * FilterSheet (phones/tablets).
 */
import { useMemo } from "react";
import { Combobox, SegmentedControl, Select, type ComboOption } from "@/components/ui";
import type { UseFiltersResult } from "@/lib/client/filters";
import { fmtNumber } from "@/lib/client/format";
import type { PeriodMode } from "@/lib/types";
import { PeriodPicker } from "./period-picker";
import { PERIOD_MODE_OPTIONS } from "./period-utils";

interface FieldProps {
  f: UseFiltersResult;
  className?: string;
  id?: string;
}

export function PeriodModeControl({ f, className, fullWidth }: FieldProps & { fullWidth?: boolean }) {
  return (
    <SegmentedControl<PeriodMode>
      options={PERIOD_MODE_OPTIONS}
      value={f.filters.period.mode}
      onChange={(mode) => f.setFilters({ period: { mode } })}
      size="sm"
      fullWidth={fullWidth}
      ariaLabel="Kỳ báo cáo"
      className={className}
    />
  );
}

export function PeriodField({ f, className, id }: FieldProps) {
  const { period } = f.filters;
  return (
    <PeriodPicker
      id={id}
      mode={period.mode}
      value={period.key}
      options={f.options}
      onChange={(key) => f.setFilters({ period: { mode: period.mode, key } })}
      className={className}
    />
  );
}

export function GradeField({ f, className, id }: FieldProps) {
  const options = useMemo(() => f.options.grades.map((g) => ({ value: String(g.value), label: g.label })), [f.options.grades]);
  return (
    <Select<string>
      id={id}
      aria-label={id ? undefined : "Khối"}
      options={options}
      value={f.filters.grade !== undefined ? String(f.filters.grade) : undefined}
      onChange={(v) => f.setFilters({ grade: v === undefined ? undefined : Number(v) })}
      placeholder="Tất cả khối"
      allowEmpty
      wrapperClassName={className}
    />
  );
}

export function ClassField({ f, className, id }: FieldProps) {
  const options = useMemo<ComboOption<string>[]>(
    () =>
      f.options.classes.map((c) => ({
        value: c.code,
        label: c.code,
        group: `Khối ${c.grade}`,
        description: c.homeroomTeacher ? `GVCN: ${c.homeroomTeacher}` : undefined,
        keywords: c.homeroomTeacher ? [c.homeroomTeacher] : undefined,
      })),
    [f.options.classes],
  );
  return (
    <Combobox<string>
      id={id}
      aria-label="Lớp"
      title="Chọn lớp"
      options={options}
      value={f.filters.classCode}
      onChange={(v) => f.setFilters({ classCode: v })}
      placeholder="Tất cả lớp"
      searchPlaceholder="Tìm lớp hoặc tên GVCN…"
      emptyText="Không có lớp phù hợp"
      clearable
      disabled={options.length === 0 && !f.filters.classCode}
      className={className}
    />
  );
}

export function CategoryField({ f, className, id }: FieldProps) {
  const options = useMemo(() => f.options.categories.map((c) => ({ value: c, label: c })), [f.options.categories]);
  return (
    <Select<string>
      id={id}
      aria-label={id ? undefined : "Mảng"}
      options={options}
      value={f.filters.category}
      onChange={(v) => f.setFilters({ category: v })}
      placeholder="Tất cả mảng"
      allowEmpty
      disabled={options.length === 0}
      wrapperClassName={className}
    />
  );
}

export function ErrorField({ f, className, id }: FieldProps) {
  const options = useMemo<ComboOption<string>[]>(
    () =>
      f.options.errors.map((e) => ({
        value: e.code,
        label: `${e.code} · ${e.issue}`,
        group: e.category,
        description: `${fmtNumber(e.penalty)} điểm${e.unit}${e.active ? "" : " · Ngừng sử dụng"}`,
        keywords: [e.issue, e.category, e.displayName ?? ""],
      })),
    [f.options.errors],
  );
  return (
    <Combobox<string>
      id={id}
      aria-label="Lỗi"
      title="Chọn lỗi"
      options={options}
      value={f.filters.errorCode}
      onChange={(v) => f.setFilters({ errorCode: v })}
      placeholder="Tất cả lỗi"
      searchPlaceholder="Tìm mã hoặc nội dung lỗi…"
      emptyText="Không có lỗi phù hợp"
      clearable
      disabled={options.length === 0 && !f.filters.errorCode}
      className={className}
    />
  );
}
