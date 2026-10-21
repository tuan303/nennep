"use client";
import { useMemo, type ReactNode } from "react";
import { ClassPicker, gradeLabel, gradesOf } from "@/components/app/widgets";
import { SearchInput, SegmentedControl, Select } from "@/components/ui";
import type { LevelDataset } from "@/lib/types";
import { STATUS_FILTER_OPTIONS, type StatusFilter } from "./lib/labels";
import type { RosterFilters } from "./lib/roster";

export interface RosterToolbarProps {
  ds: Pick<LevelDataset, "classes">;
  filters: RosterFilters;
  onChange: (patch: Partial<RosterFilters>) => void;
  /** Result line shown next to the status switch ("59 học sinh · …", "Xóa bộ lọc"). */
  summary?: ReactNode;
}

/**
 * Local filters of the roster. Row 1: search, Khối, Lớp (one row from 1024px, stacked on phones).
 * Row 2: Trạng thái switch + result summary.
 */
export function RosterToolbar({ ds, filters, onChange, summary }: RosterToolbarProps) {
  const gradeOptions = useMemo(() => gradesOf(ds.classes).map((g) => ({ value: String(g), label: gradeLabel(g) })), [ds.classes]);

  return (
    <div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_180px_240px]" data-print-hide>
        <SearchInput
          className="sm:col-span-2 lg:col-span-1"
          value={filters.query}
          onChange={(query) => onChange({ query })}
          placeholder="Tìm theo tên hoặc mã HS…"
          ariaLabel="Tìm học sinh theo tên hoặc mã HS"
        />
        <Select
          aria-label="Lọc theo khối"
          options={gradeOptions}
          value={filters.grade !== undefined ? String(filters.grade) : undefined}
          placeholder="Tất cả khối"
          allowEmpty
          onChange={(v) => {
            const grade = v ? Number(v) : undefined;
            // Keep the selected class only when it belongs to the new grade.
            const cls = filters.classCode ? ds.classes.find((c) => c.code === filters.classCode) : undefined;
            onChange({ grade, classCode: grade === undefined || cls?.grade === grade ? filters.classCode : undefined });
          }}
        />
        <ClassPicker
          ds={ds}
          allowAll
          includeInactive
          grade={filters.grade}
          value={filters.classCode}
          onChange={(classCode) => onChange({ classCode })}
          aria-label="Lọc theo lớp"
        />
      </div>
      <div className="flex flex-col gap-2 border-y border-border bg-surface-2 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <SegmentedControl<StatusFilter>
          className="w-full sm:w-auto [&>button]:flex-auto"
          ariaLabel="Trạng thái học sinh"
          options={STATUS_FILTER_OPTIONS}
          value={filters.status}
          onChange={(status) => onChange({ status })}
        />
        {summary ? <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-slate-600">{summary}</div> : null}
      </div>
    </div>
  );
}
