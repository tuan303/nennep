/** Time-based analytics: weekly trend, class × week heatmap, class timeline, 5S. Re-exported by analytics.ts. */
import { DEFAULT_5S_CODES } from "../constants";
import type { CatalogItem, GlobalFilters, Incident, LevelDataset, Period } from "../types";
import { formatDayMonthVN, isIsoDate, weekdayLabelVN } from "./dates";
import { countedRewards, filterIncidents, filterRewards } from "./filters";
import { ALL_PERIOD, elapsedWeeksInPeriod, periodMatcher } from "./period";
import { dataConfidence } from "./rag";
import { round2 } from "./scoring";
import { compareIncidentsNewestFirst } from "./analytics-students";
import { naturalCompare } from "./text";
import { compareClassInfo, compareStr, groupBy, sumBy } from "./utils";

export interface TrendPoint {
  week: string;
  label: string;
  incidents: number;
  points: number;
  rewards: number;
  confidence: number;
}

/**
 * One point per calendar week with weekStart ≤ Monday(today) (holiday weeks included), ascending.
 * Ignores f.period; honours grade/class/category/error. `rewards` = counted reward points (grade/class only).
 * label = "dd/mm" of the Monday.
 */
export function weeklyTrend(ds: LevelDataset, f: GlobalFilters, today: string): TrendPoint[] {
  const scope: GlobalFilters = { ...f, period: ALL_PERIOD };
  const incByWeek = groupBy(filterIncidents(ds, scope), (i) => i.week);
  const rewByWeek = groupBy(countedRewards(filterRewards(ds, scope), ds.config), (r) => r.week);
  return elapsedWeeksInPeriod(ALL_PERIOD, ds.weeks, today).map((w) => {
    const inc = incByWeek.get(w.weekStart) ?? [];
    return {
      week: w.weekStart,
      label: formatDayMonthVN(w.weekStart),
      incidents: inc.length,
      points: sumBy(inc, (i) => i.points),
      rewards: sumBy(rewByWeek.get(w.weekStart) ?? [], (r) => r.points),
      confidence: dataConfidence(inc),
    };
  });
}

/**
 * Penalty points per (week, class): weeks = elapsed calendar weeks of f.period (ascending, Monday dates);
 * classes = active classes in scope (grade, order, code). `values` lists every cell, zeros included.
 */
export function classWeekHeatmap(
  ds: LevelDataset,
  f: GlobalFilters,
  today: string,
): { classes: string[]; weeks: string[]; values: Array<[weekIdx: number, classIdx: number, points: number]> } {
  const hasGrade = typeof f.grade === "number";
  const classes = ds.classes
    .filter((c) => c.active && (!hasGrade || c.grade === f.grade) && (!f.classCode || c.code === f.classCode))
    .sort(compareClassInfo)
    .map((c) => c.code);
  const weeks = elapsedWeeksInPeriod(f.period, ds.weeks, today).map((w) => w.weekStart);
  const cell = new Map<string, number>();
  for (const i of filterIncidents(ds, f)) {
    const k = `${i.week}|${i.classCode}`;
    cell.set(k, (cell.get(k) ?? 0) + i.points);
  }
  const values: Array<[number, number, number]> = [];
  weeks.forEach((w, wi) => {
    classes.forEach((c, ci) => {
      values.push([wi, ci, round2(cell.get(`${w}|${c}`) ?? 0)]);
    });
  });
  return { classes, weeks, values };
}

export interface TimelineDay {
  date: string;
  weekday: string;
  points: number;
  items: Incident[];
}

/** Incidents of a class in the period grouped by day, newest day first; items newest first (FR-CLS-002). */
export function classTimeline(ds: LevelDataset, classCode: string, period: Period): TimelineDay[] {
  const inPeriod = periodMatcher(period, ds.weeks);
  const items = ds.incidents.filter((i) => !i.deletedAt && i.classCode === classCode && inPeriod(i));
  return [...groupBy(items, (i) => i.date).entries()]
    .sort((a, b) => compareStr(b[0], a[0]))
    .map(([date, list]) => ({
      date,
      weekday: isIsoDate(date) ? weekdayLabelVN(date) : "",
      points: sumBy(list, (i) => i.points),
      items: [...list].sort(compareIncidentsNewestFirst),
    }));
}

/** Error codes tracked as 5S: catalog items flagged is5S (DEFAULT_5S_CODES when the catalog is empty). */
export function fiveSCodes(catalog: CatalogItem[]): Set<string> {
  if (catalog.length === 0) return new Set(DEFAULT_5S_CODES);
  return new Set(catalog.filter((c) => c.is5S).map((c) => c.code));
}

/**
 * 5S tracking (FR-RAG-003) on the filtered incidents restricted to 5S errors.
 * byClass: classes with 5S incidents (points desc); byWeek: elapsed calendar weeks of the period (ascending).
 */
export function fiveS(
  ds: LevelDataset,
  f: GlobalFilters,
  today: string,
): {
  incidents: number;
  points: number;
  byClass: Array<{ classCode: string; incidents: number; points: number }>;
  byWeek: Array<{ week: string; label: string; incidents: number; points: number }>;
} {
  const codes = fiveSCodes(ds.catalog);
  const inc = filterIncidents(ds, f).filter((i) => codes.has(i.errorCode));
  const byClass = [...groupBy(inc, (i) => i.classCode).entries()]
    .map(([classCode, list]) => ({ classCode, incidents: list.length, points: sumBy(list, (i) => i.points) }))
    .sort((a, b) => b.points - a.points || b.incidents - a.incidents || naturalCompare(a.classCode, b.classCode));
  const incByWeek = groupBy(inc, (i) => i.week);
  const byWeek = elapsedWeeksInPeriod(f.period, ds.weeks, today).map((w) => {
    const list = incByWeek.get(w.weekStart) ?? [];
    return { week: w.weekStart, label: formatDayMonthVN(w.weekStart), incidents: list.length, points: sumBy(list, (i) => i.points) };
  });
  return { incidents: inc.length, points: sumBy(inc, (i) => i.points), byClass, byWeek };
}
