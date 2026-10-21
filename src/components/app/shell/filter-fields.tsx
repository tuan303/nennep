"use client";
/**
 * Individual global-filter controls bound to `useFilters()` – composed by FilterBar (desktop row) and
 * FilterSheet (phones/tablets).
 */
import { useMemo } from "react";
import { Combobox, SegmentedControl, Select, type ComboOption } from "@/components/ui";
import type { StudentFilterOption, UseFiltersResult } from "@/lib/client/filters";
import { fmtNumber } from "@/lib/client/format";
import { STUDENT_STATUS_LABELS } from "@/lib/constants";
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

export function GroupField({ f, className, id }: FieldProps) {
  const options = useMemo(() => f.options.groups.map((g) => ({ value: g, label: g })), [f.options.groups]);
  return (
    <Select<string>
      id={id}
      aria-label={id ? undefined : "Nhóm lỗi"}
      options={options}
      value={f.filters.group}
      onChange={(v) => f.setFilters({ group: v })}
      placeholder="Tất cả nhóm lỗi"
      allowEmpty
      disabled={options.length === 0 && !f.filters.group}
      wrapperClassName={className}
    />
  );
}

/** Option text of the "Học sinh" filter: label = Họ tên, description = "Mã HS · Lớp" (+ status when not studying). */
export function studentOption(s: StudentFilterOption): ComboOption<string> {
  const status = s.status === "ACTIVE" ? "" : ` · ${STUDENT_STATUS_LABELS[s.status]}`;
  return {
    value: s.id,
    label: s.name,
    group: `Lớp ${s.classCode}`,
    description: `${s.id} · ${s.classCode}${status}`,
    keywords: [s.id, s.classCode],
  };
}

/** Pill / summary text of the student filter: "HS Nguyễn Văn A" (falls back to the Mã HS). */
export function studentFilterLabel(f: Pick<UseFiltersResult, "filters" | "options">): string | undefined {
  const id = f.filters.studentId;
  if (!id) return undefined;
  const s = f.options.students.find((o) => o.id === id);
  return `HS ${s ? s.name : id}`;
}

export function StudentField({ f, className, id }: FieldProps) {
  const options = useMemo<ComboOption<string>[]>(() => f.options.students.map(studentOption), [f.options.students]);
  return (
    <Combobox<string>
      id={id}
      aria-label="Học sinh"
      title="Chọn học sinh"
      options={options}
      value={f.filters.studentId}
      onChange={(v) => f.setFilters({ studentId: v })}
      placeholder="Tất cả học sinh"
      searchPlaceholder="Tìm tên hoặc mã học sinh…"
      emptyText="Không có học sinh phù hợp"
      clearable
      disabled={options.length === 0 && !f.filters.studentId}
      className={className}
    />
  );
}
