/** "Lịch tuần" editor model: rows, select options, validation, payload and calendar-vs-config checks. */
import type { WeeksPutInput } from "@/lib/contract";
import { addDays, formatMonthLabel, formatWeekLabel, generateWeeks, mondayOf, monthOf } from "@/lib/engine/dates";
import type { LevelConfig, SchoolWeek, Semester } from "@/lib/types";
import type { RowErrors } from "./draft";

export interface WeekRow {
  weekStart: string;
  month: string;
  semester: string;
  counted: boolean;
  note: string;
}

export type WeekField = "month" | "semester" | "note";

export function rowsFromWeeks(weeks: readonly SchoolWeek[]): WeekRow[] {
  return [...weeks]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({ weekStart: w.weekStart, month: w.month, semester: w.semester, counted: w.counted, note: w.note ?? "" }));
}

/** "Tuần 12/10 – 18/10/2026" */
export function weekRowLabel(weekStart: string): string {
  return `Tuần ${formatWeekLabel(weekStart)}`;
}

/** Month choices of a week: the months of its Monday and Sunday, plus the current value. */
export function monthOptionsOf(row: Pick<WeekRow, "weekStart" | "month">): Array<{ value: string; label: string }> {
  const set = new Set([monthOf(row.weekStart), monthOf(addDays(row.weekStart, 6))]);
  if (/^\d{4}-\d{2}$/.test(row.month)) set.add(row.month);
  return [...set].sort().map((m) => ({ value: m, label: formatMonthLabel(m) }));
}

/** Semester choices ("" = outside every semester). */
export function semesterOptionsOf(semesters: readonly Semester[], current?: string): Array<{ value: string; label: string }> {
  const out = [{ value: "", label: "Ngoài học kỳ" }, ...semesters.map((s) => ({ value: s.code, label: s.name || s.code }))];
  if (current && !out.some((o) => o.value === current)) out.push({ value: current, label: `${current} (không còn trong cấu hình)` });
  return out;
}

export function isCurrentWeek(weekStart: string, today: string): boolean {
  return weekStart === mondayOf(today);
}

export function validateWeekRows(rows: readonly WeekRow[], semesters: readonly Semester[]): RowErrors<WeekField> {
  const codes = new Set(semesters.map((s) => s.code));
  const out: RowErrors<WeekField> = {};
  for (const r of rows) {
    const e: Partial<Record<WeekField, string>> = {};
    if (!/^\d{4}-\d{2}$/.test(r.month)) e.month = "Chọn tháng.";
    if (r.semester && !codes.has(r.semester)) e.semester = "Học kỳ không có trong cấu hình.";
    if (r.note.trim().length > 200) e.note = "Ghi chú tối đa 200 ký tự.";
    if (Object.keys(e).length > 0) out[r.weekStart] = e;
  }
  return out;
}

export function weeksPayload(rows: readonly WeekRow[]): WeeksPutInput {
  return {
    items: rows.map((r) => ({
      weekStart: r.weekStart,
      month: r.month,
      semester: r.semester,
      counted: r.counted,
      ...(r.note.trim() ? { note: r.note.trim() } : {}),
    })),
  };
}

export interface WeeksSummary {
  total: number;
  counted: number;
  notCounted: number;
  /** Weeks whose Monday is on/before Monday(today). */
  elapsed: number;
  currentIndex: number;
}

export function weeksSummary(rows: readonly WeekRow[], today: string): WeeksSummary {
  const monday = mondayOf(today);
  const counted = rows.filter((r) => r.counted).length;
  return {
    total: rows.length,
    counted,
    notCounted: rows.length - counted,
    elapsed: rows.filter((r) => r.weekStart <= monday).length,
    currentIndex: rows.findIndex((r) => r.weekStart === monday),
  };
}

/**
 * Differences between the saved calendar and what "Tạo lại từ cấu hình" would produce:
 * weeks to add / remove and weeks whose semester would change. Empty → calendar matches the config.
 */
export function calendarDrift(weeks: readonly Pick<SchoolWeek, "weekStart" | "semester">[], config: Pick<LevelConfig, "firstWeek" | "semesters">) {
  const expected = generateWeeks(config.firstWeek, config.semesters);
  const have = new Map(weeks.map((w) => [w.weekStart, w]));
  const want = new Map(expected.map((w) => [w.weekStart, w]));
  const added = expected.filter((w) => !have.has(w.weekStart)).map((w) => w.weekStart);
  const removed = weeks.filter((w) => !want.has(w.weekStart)).map((w) => w.weekStart);
  const semesterChanged = expected.filter((w) => have.has(w.weekStart) && have.get(w.weekStart)!.semester !== w.semester).map((w) => w.weekStart);
  return { added, removed, semesterChanged, matches: added.length + removed.length + semesterChanged.length === 0 };
}

export function weekChangesCount(rows: readonly WeekRow[], base: readonly WeekRow[]): number {
  const old = new Map(base.map((r) => [r.weekStart, r]));
  return rows.filter((r) => {
    const o = old.get(r.weekStart);
    return !o || o.month !== r.month || o.semester !== r.semester || o.counted !== r.counted || o.note.trim() !== r.note.trim();
  }).length;
}
