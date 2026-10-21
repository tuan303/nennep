/**
 * Calendar helpers. All calendar dates are "yyyy-mm-dd" strings in Asia/Ho_Chi_Minh.
 * Arithmetic is done in UTC on date-only values so DST/timezone of the runtime never matters.
 */
import type { SchoolWeek, Semester } from "../types";

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUtc(date: string): Date {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date "${date}" (expected yyyy-mm-dd)`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date in Vietnam (UTC+7, no DST). */
export function todayVN(now: Date = new Date()): string {
  return fromUtc(new Date(now.getTime() + 7 * 3_600_000));
}

/** Convert a JS Date (e.g. from Excel) to the Vietnamese calendar date. Excel dates arrive as UTC midnight. */
export function dateToIso(d: Date): string {
  // Excel serials parsed by ExcelJS are UTC-midnight based; keep the UTC calendar day.
  return fromUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
}

export function addDays(date: string, n: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + n * DAY_MS));
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / DAY_MS);
}

/** Monday of the ISO week containing `date` (Excel: B - WEEKDAY(B,2) + 1). */
export function mondayOf(date: string): string {
  const d = toUtc(date);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(date, -dow);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

const WEEKDAY_VN = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
export function weekdayLabelVN(date: string): string {
  return WEEKDAY_VN[weekdayIndex(date)];
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

/** dd/mm/yyyy */
export function formatDateVN(date: string | undefined | null): string {
  if (!date || !isIsoDate(date)) return "";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** dd/mm */
export function formatDayMonthVN(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

/** "17/08 – 23/08/2026" (Monday → Sunday) */
export function formatWeekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${formatDayMonthVN(weekStart)} – ${formatDateVN(end)}`;
}

/** "Tháng 9/2026" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

/** Parse "dd/mm/yyyy", "d/m/yyyy", "yyyy-mm-dd" or "yyyy-mm-ddTHH:mm..." into yyyy-mm-dd; "" if invalid. */
export function parseLooseDate(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const iso = t.slice(0, 10);
  if (isIsoDate(iso)) return iso;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) {
    const out = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isIsoDate(out) ? out : "";
  }
  return "";
}

export function semesterOfDate(date: string, semesters: Semester[]): string {
  const s = semesters.find((x) => date >= x.start && date <= x.end);
  return s ? s.code : "";
}

/**
 * Build the school-week calendar: every Monday from `firstWeek` up to the end of the last semester.
 * month = month of the Monday; semester = semester containing the Monday; counted = true.
 */
export function generateWeeks(firstWeek: string, semesters: Semester[]): SchoolWeek[] {
  const lastEnd = semesters.reduce((acc, s) => (s.end > acc ? s.end : acc), firstWeek);
  const out: SchoolWeek[] = [];
  for (let w = mondayOf(firstWeek); w <= lastEnd; w = addDays(w, 7)) {
    out.push({ weekStart: w, month: monthOf(w), semester: semesterOfDate(w, semesters), counted: true });
  }
  return out;
}

/**
 * Week / month / semester of an event date. Uses the configured SchoolWeek row when it exists
 * (so admins can re-assign a week to another month/semester), otherwise derives it from the Monday.
 */
export function weekInfo(
  date: string,
  weeks: SchoolWeek[],
  semesters: Semester[],
): { week: string; month: string; semester: string } {
  const week = mondayOf(date);
  const row = weeks.find((w) => w.weekStart === week);
  if (row) return { week, month: row.month, semester: row.semester };
  return { week, month: monthOf(week), semester: semesterOfDate(week, semesters) };
}
