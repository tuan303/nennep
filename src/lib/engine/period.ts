/**
 * Reporting periods (week / month / semester / whole school year) over the school-week calendar.
 *
 * Membership rules (authoritative):
 * - week:     record.week === key (Monday yyyy-mm-dd)
 * - month:    the record's week row in the calendar has month === key; weeks missing from the calendar
 *             fall back to record.month === key
 * - semester: calendar row semester === key; weeks missing from the calendar are in no semester (a record of
 *             another school year carries the same "HK1"/"HK2" code and must not count in this year's semester –
 *             same rule as `isWeekInPeriod`; the server dataset already leaves such records out)
 * - all:      every record
 * A non-"all" period without a key is treated as "all".
 */
import type { Period, PeriodMode, SchoolWeek, Semester } from "../types";
import { formatDateVN, formatMonthLabel, formatWeekLabel, isIsoDate, mondayOf, monthOf, semesterOfDate } from "./dates";
import { compareStr, sortWeeks } from "./utils";

export interface PeriodOption {
  mode: PeriodMode;
  key: string;
  label: string;
  isFuture: boolean;
  isCurrent: boolean;
}

export const ALL_PERIOD: Period = { mode: "all" };

/** Minimal shape needed to place a record (incident / reward) in a period. */
export interface PeriodRecord {
  week: string;
  month: string;
  semester: string;
}

/** True for "all" and for a non-"all" period without a key (treated as "all"). */
export function isAllPeriod(period: Period): boolean {
  return period.mode === "all" || !period.key;
}

/**
 * Build a fast membership test for records (incidents, rewards) – builds the week index once.
 * Prefer this over calling `isWeekInPeriod` in a loop.
 */
export function periodMatcher(period: Period, weeks: SchoolWeek[]): (rec: PeriodRecord) => boolean {
  if (isAllPeriod(period)) return () => true;
  const key = period.key as string;
  if (period.mode === "week") return (rec) => rec.week === key;
  const byStart = new Map(weeks.map((w) => [w.weekStart, w] as const));
  if (period.mode === "month") {
    return (rec) => {
      const row = byStart.get(rec.week);
      return row ? row.month === key : rec.month === key;
    };
  }
  return (rec) => byStart.get(rec.week)?.semester === key;
}

/** Same as `periodMatcher(...)(record)` for a single record. */
export function isRecordInPeriod(rec: PeriodRecord, period: Period, weeks: SchoolWeek[]): boolean {
  return periodMatcher(period, weeks)(rec);
}

/**
 * Is the week starting `weekStart` part of the period? Weeks missing from the calendar fall back to the
 * month of the Monday (month mode) and are never in a semester (semester mode).
 */
export function isWeekInPeriod(weekStart: string, period: Period, weeks: SchoolWeek[]): boolean {
  if (isAllPeriod(period)) return true;
  const key = period.key as string;
  if (period.mode === "week") return weekStart === key;
  const row = weeks.find((w) => w.weekStart === weekStart);
  if (period.mode === "month") return row ? row.month === key : monthOf(weekStart) === key;
  return row ? row.semester === key : false;
}

/** Server message (400) for a record dated outside the school-week calendar; the forms show the same text. */
export function outsideCalendarMessage(date: string): string {
  return `Ngày ${formatDateVN(date)} không thuộc lịch tuần của năm học (Cài đặt → Lịch tuần).`;
}

/**
 * Records are only stored on dates whose Monday is a calendar week (otherwise they would be invisible everywhere):
 * the message for a valid date outside the calendar, undefined when inside (or empty / not a valid date).
 */
export function calendarDateProblem(date: string, weeks: readonly SchoolWeek[] | ReadonlySet<string>): string | undefined {
  if (!isIsoDate(date)) return undefined;
  const monday = mondayOf(date);
  const inside = weeks instanceof Set ? weeks.has(monday) : (weeks as readonly SchoolWeek[]).some((w) => w.weekStart === monday);
  return inside ? undefined : outsideCalendarMessage(date);
}

/** First Monday of the calendar (earliest date a record can be given), undefined for an empty calendar. */
export function calendarStart(weeks: readonly SchoolWeek[]): string | undefined {
  let first: string | undefined;
  for (const w of weeks) if (first === undefined || w.weekStart < first) first = w.weekStart;
  return first;
}

/** Calendar weeks of the period, sorted by weekStart ascending. */
export function weeksInPeriod(period: Period, weeks: SchoolWeek[]): SchoolWeek[] {
  const sorted = sortWeeks(weeks);
  if (isAllPeriod(period)) return sorted;
  const key = period.key as string;
  switch (period.mode) {
    case "week":
      return sorted.filter((w) => w.weekStart === key);
    case "month":
      return sorted.filter((w) => w.month === key);
    default:
      return sorted.filter((w) => w.semester === key);
  }
}

/** Weeks of the period that have started (weekStart ≤ Monday of `today`), ascending. Includes non-counted weeks. */
export function elapsedWeeksInPeriod(period: Period, weeks: SchoolWeek[], today: string): SchoolWeek[] {
  const currentMonday = mondayOf(today);
  return weeksInPeriod(period, weeks).filter((w) => w.weekStart <= currentMonday);
}

/**
 * BR-RANK-02/03: number of weeks of the period with counted=true AND weekStart ≤ Monday(today).
 * Week mode: 1 if that week is counted and has started, else 0.
 */
export function countedWeeks(period: Period, weeks: SchoolWeek[], today: string): number {
  return elapsedWeeksInPeriod(period, weeks, today).filter((w) => w.counted).length;
}

/**
 * Wider period giving context to week-based views (class recidivism, heatmap, 5S trend): a week is widened to its
 * semester (or the whole year when the week is outside every semester). Other periods are returned unchanged.
 */
export function contextPeriod(period: Period, weeks: SchoolWeek[]): { period: Period; widened: boolean } {
  if (period.mode !== "week" || !period.key) return { period, widened: false };
  const row = weeks.find((w) => w.weekStart === period.key);
  if (row?.semester) return { period: { mode: "semester", key: row.semester }, widened: true };
  return { period: ALL_PERIOD, widened: true };
}

/** Current week if it is in the calendar, else the last past calendar week, else "all". */
export function defaultPeriod(weeks: SchoolWeek[], today: string): Period {
  const currentMonday = mondayOf(today);
  const sorted = sortWeeks(weeks);
  if (sorted.some((w) => w.weekStart === currentMonday)) return { mode: "week", key: currentMonday };
  const past = sorted.filter((w) => w.weekStart < currentMonday);
  if (past.length > 0) return { mode: "week", key: past[past.length - 1].weekStart };
  return { mode: "all" };
}

function sortedSemesters(semesters: Semester[]): Semester[] {
  return [...semesters].sort((a, b) => compareStr(a.start, b.start));
}

/** The period immediately before `period` (previous calendar week / month / semester); undefined for "all" or the first one. */
export function previousPeriod(period: Period, weeks: SchoolWeek[], semesters: Semester[]): Period | undefined {
  if (isAllPeriod(period)) return undefined;
  const key = period.key as string;
  if (period.mode === "week") {
    const prev = sortWeeks(weeks).filter((w) => w.weekStart < key);
    return prev.length ? { mode: "week", key: prev[prev.length - 1].weekStart } : undefined;
  }
  if (period.mode === "month") {
    const months = [...new Set(weeks.map((w) => w.month))].filter((m) => m < key).sort();
    return months.length ? { mode: "month", key: months[months.length - 1] } : undefined;
  }
  const sems = sortedSemesters(semesters);
  const idx = sems.findIndex((s) => s.code === key);
  return idx > 0 ? { mode: "semester", key: sems[idx - 1].code } : undefined;
}

/** "Tuần 12/10 – 18/10/2026", "Tháng 10/2026", "Học kỳ I", "Toàn bộ năm học". */
export function periodLabel(period: Period, semesters: Semester[]): string {
  if (isAllPeriod(period)) return "Toàn bộ năm học";
  const key = period.key as string;
  switch (period.mode) {
    case "week":
      return `Tuần ${formatWeekLabel(key)}`;
    case "month":
      return formatMonthLabel(key);
    default:
      return semesters.find((s) => s.code === key)?.name ?? `Học kỳ ${key}`;
  }
}

/**
 * Options for period pickers, each list in chronological order. Non-counted weeks are labelled
 * "(không tính thi đua)". `isCurrent` refers to the week containing `today` (and its month/semester).
 */
export function periodOptions(
  weeks: SchoolWeek[],
  semesters: Semester[],
  today: string,
): { weeks: PeriodOption[]; months: PeriodOption[]; semesters: PeriodOption[] } {
  const sorted = sortWeeks(weeks);
  const currentMonday = mondayOf(today);
  const currentRow = sorted.find((w) => w.weekStart === currentMonday);
  const currentMonth = currentRow ? currentRow.month : monthOf(currentMonday);
  const currentSemester = currentRow ? currentRow.semester : semesterOfDate(currentMonday, semesters);

  const weekOptions: PeriodOption[] = sorted.map((w) => ({
    mode: "week",
    key: w.weekStart,
    label: periodLabel({ mode: "week", key: w.weekStart }, semesters) + (w.counted ? "" : " (không tính thi đua)"),
    isFuture: w.weekStart > currentMonday,
    isCurrent: w.weekStart === currentMonday,
  }));

  const firstWeekOfMonth = new Map<string, string>();
  for (const w of sorted) if (!firstWeekOfMonth.has(w.month)) firstWeekOfMonth.set(w.month, w.weekStart);
  const monthOptions: PeriodOption[] = [...firstWeekOfMonth.entries()]
    .sort((a, b) => compareStr(a[0], b[0]))
    .map(([month, first]) => ({
      mode: "month",
      key: month,
      label: formatMonthLabel(month),
      isFuture: first > currentMonday,
      isCurrent: month === currentMonth,
    }));

  const semesterOptions: PeriodOption[] = sortedSemesters(semesters).map((s) => {
    const first = sorted.find((w) => w.semester === s.code);
    return {
      mode: "semester",
      key: s.code,
      label: s.name,
      isFuture: first ? first.weekStart > currentMonday : s.start > today,
      isCurrent: s.code === currentSemester,
    };
  });

  return { weeks: weekOptions, months: monthOptions, semesters: semesterOptions };
}
