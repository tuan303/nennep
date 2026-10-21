/**
 * Pure helpers behind PeriodPicker / FilterBar (unit-tested in period-utils.test.ts).
 */
import { PERIOD_MODE_LABELS } from "@/lib/constants";
import { formatMonthLabel, formatWeekLabel } from "@/lib/engine/dates";
import type { PeriodOption } from "@/lib/engine/period";
import type { Period, PeriodMode } from "@/lib/types";

export interface PeriodOptionLists {
  weeks: PeriodOption[];
  months: PeriodOption[];
  semesters: PeriodOption[];
}

export const PERIOD_MODES: readonly PeriodMode[] = ["all", "week", "month", "semester"];

export const PERIOD_MODE_OPTIONS = PERIOD_MODES.map((m) => ({ value: m, label: PERIOD_MODE_LABELS[m] }));

/** Chronological option list of a mode ([] for "all"). */
export function optionsOfMode(lists: PeriodOptionLists, mode: PeriodMode): PeriodOption[] {
  if (mode === "week") return lists.weeks;
  if (mode === "month") return lists.months;
  if (mode === "semester") return lists.semesters;
  return [];
}

export interface PeriodChoice {
  value: string;
  label: string;
  group?: string;
  description?: string;
  isCurrent: boolean;
}

/**
 * Picker rows: weeks and months newest first (future ones hidden unless selected), weeks grouped by month;
 * semesters in calendar order (future ones marked "Chưa bắt đầu").
 */
export function periodChoices(lists: PeriodOptionLists, mode: PeriodMode, selected?: string): PeriodChoice[] {
  const list = optionsOfMode(lists, mode);
  if (mode === "semester") {
    return list.map((o) => ({
      value: o.key,
      label: o.label,
      isCurrent: o.isCurrent,
      description: o.isCurrent ? "Học kỳ hiện tại" : o.isFuture ? "Chưa bắt đầu" : undefined,
    }));
  }
  const unit = mode === "week" ? "Tuần" : "Tháng";
  return list
    .filter((o) => !o.isFuture || o.key === selected)
    .reverse()
    .map((o) => ({
      value: o.key,
      label: o.label,
      isCurrent: o.isCurrent,
      group: mode === "week" ? formatMonthLabel(o.key.slice(0, 7)) : undefined,
      description: o.isCurrent ? `${unit} hiện tại` : o.isFuture ? "Chưa diễn ra" : undefined,
    }));
}

/**
 * Key of the previous (dir = -1) or next (dir = 1) period of the same mode; undefined at either end.
 * Moving forward never enters a future period.
 */
export function stepPeriodKey(list: readonly PeriodOption[], key: string | undefined, dir: -1 | 1): string | undefined {
  const idx = list.findIndex((o) => o.key === key);
  if (idx < 0) return undefined;
  const target = list[idx + dir];
  if (!target || (dir > 0 && target.isFuture)) return undefined;
  return target.key;
}

/** Human label of a period: from the option lists when possible, else formatted from the key. */
export function periodText(period: Period, lists: PeriodOptionLists): string {
  if (period.mode === "all" || !period.key) return "Toàn bộ năm học";
  const found = optionsOfMode(lists, period.mode).find((o) => o.key === period.key);
  if (found) return found.label;
  if (period.mode === "week") return `Tuần ${formatWeekLabel(period.key)}`;
  if (period.mode === "month") return formatMonthLabel(period.key);
  return period.key;
}
