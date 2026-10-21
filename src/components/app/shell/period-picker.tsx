"use client";
import { useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Combobox, IconButton, cn, type ComboOption } from "@/components/ui";
import type { PeriodMode } from "@/lib/types";
import { optionsOfMode, periodChoices, stepPeriodKey, type PeriodOptionLists } from "./period-utils";

export interface PeriodPickerProps {
  /** "all" renders a static "Toàn bộ năm học" field. */
  mode: PeriodMode;
  /** Selected key (week Monday "yyyy-mm-dd", month "yyyy-mm", semester code). */
  value?: string;
  /** Option lists, e.g. `useFilters().options` or engine `periodOptions(...)`. */
  options: PeriodOptionLists;
  onChange: (key: string) => void;
  /** Previous / next buttons around the picker (default true). */
  arrows?: boolean;
  disabled?: boolean;
  id?: string;
  size?: "md" | "lg";
  className?: string;
}

const NOUN: Record<PeriodMode, string> = { all: "kỳ", week: "tuần", month: "tháng", semester: "học kỳ" };

/**
 * Searchable period picker: weeks "Tuần 12/10 – 18/10/2026" (grouped by month, newest first, current marked),
 * months, semesters; ‹ › step to the adjacent period (never into the future).
 */
export function PeriodPicker({ mode, value, options, onChange, arrows = true, disabled, id, size = "md", className }: PeriodPickerProps) {
  const choices = useMemo(() => periodChoices(options, mode, value), [options, mode, value]);
  const comboOptions = useMemo<ComboOption<string>[]>(
    () => choices.map((c) => ({ value: c.value, label: c.label, group: c.group, description: c.description })),
    [choices],
  );
  const current = useMemo(() => new Set(choices.filter((c) => c.isCurrent).map((c) => c.value)), [choices]);

  if (mode === "all") {
    return (
      <div
        id={id}
        className={cn(
          "flex h-11 min-w-0 items-center gap-2 rounded-control border border-dashed border-border-strong bg-surface-2 px-3 text-sm text-slate-600 sm:h-10",
          className,
        )}
      >
        <CalendarDays aria-hidden className="size-[18px] shrink-0 text-slate-400" strokeWidth={2} />
        <span className="truncate">Toàn bộ năm học</span>
      </div>
    );
  }

  const list = optionsOfMode(options, mode);
  const prev = stepPeriodKey(list, value, -1);
  const next = stepPeriodKey(list, value, 1);
  const noun = NOUN[mode];
  const isEmpty = comboOptions.length === 0;

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {arrows ? (
        <IconButton
          icon={ChevronLeft}
          label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} trước`}
          variant="secondary"
          disabled={disabled || !prev}
          onClick={() => prev && onChange(prev)}
          className="shrink-0"
        />
      ) : null}
      <Combobox
        id={id}
        options={comboOptions}
        value={value}
        onChange={(v) => v && onChange(v)}
        icon={CalendarDays}
        size={size}
        disabled={disabled || isEmpty}
        placeholder={isEmpty ? "Đang tải lịch tuần…" : `Chọn ${noun}`}
        searchPlaceholder={mode === "week" ? "Tìm theo ngày, ví dụ 12/10" : `Tìm ${noun}…`}
        emptyText={`Không có ${noun} phù hợp`}
        aria-label={`Chọn ${noun}`}
        title={`Chọn ${noun}`}
        renderValue={(o) => <span className="num">{mode === "week" ? o.label.replace(/^Tuần\s+/, "") : o.label}</span>}
        renderOption={(o, { selected }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className={cn("num truncate", selected && "font-semibold")}>{o.label}</div>
              {o.description && !current.has(o.value) ? <div className="truncate text-xs text-slate-500">{o.description}</div> : null}
            </div>
            {current.has(o.value) ? (
              <Badge tone="star" size="sm">
                Hiện tại
              </Badge>
            ) : null}
          </div>
        )}
        className="min-w-0 flex-1"
      />
      {arrows ? (
        <IconButton
          icon={ChevronRight}
          label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} sau`}
          variant="secondary"
          disabled={disabled || !next}
          onClick={() => next && onChange(next)}
          className="shrink-0"
        />
      ) : null}
    </div>
  );
}
