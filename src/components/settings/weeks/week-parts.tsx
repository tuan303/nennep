"use client";
import { useState } from "react";
import { CalendarOff, ChevronDown } from "lucide-react";
import { Badge, Field, Input, Select, Switch, cn } from "@/components/ui";
import { formatMonthLabel } from "@/lib/engine/dates";
import type { Semester } from "@/lib/types";
import type { RowErrors } from "../lib/draft";
import { monthOptionsOf, semesterOptionsOf, weekRowLabel, type WeekField, type WeekRow } from "../lib/weeks-edit";
import { CellError } from "../shared/notice";

export const weekAnchorId = (weekStart: string) => `tuan-${weekStart}`;

export interface WeekEditorApi {
  update: (weekStart: string, patch: Partial<WeekRow>) => void;
  errors: RowErrors<WeekField>;
  semesters: readonly Semester[];
  disabled: boolean;
}

/** "Tuần 12/10 – 18/10/2026" + "Tuần thứ n" + current / not-counted badges (anchor for "Tuần hiện tại"). */
export function WeekLabel({ row, index, current }: { row: WeekRow; index?: number; current: boolean }) {
  return (
    <div id={weekAnchorId(row.weekStart)} className="flex scroll-mt-28 flex-col items-start gap-1">
      <span className="num font-semibold text-brand-900">{weekRowLabel(row.weekStart)}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        {index ? <span className="num">Tuần thứ {index}</span> : null}
        {current ? (
          <Badge tone="star" size="sm" variant="solid">
            Hiện tại
          </Badge>
        ) : null}
        {!row.counted ? (
          <Badge tone="muted" size="sm" icon={CalendarOff}>
            Không tính thi đua
          </Badge>
        ) : null}
      </span>
    </div>
  );
}

export function MonthSelect({ row, api }: { row: WeekRow; api: WeekEditorApi }) {
  const error = api.errors[row.weekStart]?.month;
  return (
    <div>
      <Select
        options={monthOptionsOf(row)}
        value={row.month}
        onChange={(v) => v && api.update(row.weekStart, { month: v })}
        aria-label={`Tháng của ${weekRowLabel(row.weekStart)}`}
        invalid={!!error}
        disabled={api.disabled}
      />
      <CellError message={error} />
    </div>
  );
}

export function SemesterSelect({ row, api }: { row: WeekRow; api: WeekEditorApi }) {
  const error = api.errors[row.weekStart]?.semester;
  return (
    <div>
      <Select
        options={semesterOptionsOf(api.semesters, row.semester)}
        value={row.semester}
        onChange={(v) => api.update(row.weekStart, { semester: v ?? "" })}
        aria-label={`Học kỳ của ${weekRowLabel(row.weekStart)}`}
        invalid={!!error}
        disabled={api.disabled}
      />
      <CellError message={error} />
    </div>
  );
}

export function NoteInput({ row, api, placeholder }: { row: WeekRow; api: WeekEditorApi; placeholder?: string }) {
  const error = api.errors[row.weekStart]?.note;
  return (
    <div>
      <Input
        value={row.note}
        onChange={(e) => api.update(row.weekStart, { note: e.target.value })}
        placeholder={placeholder}
        aria-label={`Ghi chú ${weekRowLabel(row.weekStart)}`}
        invalid={!!error}
        maxLength={220}
        disabled={api.disabled}
      />
      <CellError message={error} />
    </div>
  );
}

/** Phone card: week + "Tính thi đua" switch; month / semester / note behind a disclosure. */
export function WeekCard({ row, index, current, api }: { row: WeekRow; index: number; current: boolean; api: WeekEditorApi }) {
  const hasError = !!api.errors[row.weekStart];
  const [open, setOpen] = useState(false);
  const expanded = open || hasError;
  const semesterName = api.semesters.find((s) => s.code === row.semester)?.name ?? (row.semester || "Ngoài học kỳ");
  const panelId = `week-${row.weekStart}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <WeekLabel row={row} index={index} current={current} />
        <Switch
          checked={row.counted}
          onChange={(v) => api.update(row.weekStart, { counted: v })}
          aria-label={`Tính thi đua ${weekRowLabel(row.weekStart)}`}
          disabled={api.disabled}
        />
      </div>
      {row.note.trim() && !expanded ? <p className="text-[13px] leading-5 text-slate-600">{row.note}</p> : null}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setOpen(!expanded)}
        className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-control px-1 text-left text-[13px] text-slate-500 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span className="num truncate">
          {formatMonthLabel(row.month)} · {semesterName}
          {row.note.trim() ? "" : " · chưa có ghi chú"}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-semibold text-brand-700">
          {expanded ? "Thu gọn" : "Sửa"}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </span>
      </button>
      {expanded ? (
        <div id={panelId} className="flex flex-col gap-3 rounded-control bg-surface-2 p-3 ring-1 ring-inset ring-border">
          <Field label="Tháng">
            <MonthSelect row={row} api={api} />
          </Field>
          <Field label="Học kỳ">
            <SemesterSelect row={row} api={api} />
          </Field>
          <Field label="Ghi chú">
            <NoteInput row={row} api={api} placeholder="VD: Nghỉ lễ 2/9" />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
