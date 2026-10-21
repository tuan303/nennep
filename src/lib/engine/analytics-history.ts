/**
 * History charts (REQ_V2 §4.3): cumulative penalty by week and rank movement (bump chart) per grade.
 * Re-exported by analytics.ts.
 */
import type { ClassInfo, GlobalFilters, Incident, LevelDataset, Period } from "../types";
import { formatDayMonthVN } from "./dates";
import { countedRewards, filterIncidents } from "./filters";
import { ALL_PERIOD, contextPeriod, elapsedWeeksInPeriod, periodMatcher } from "./period";
import { competitionRanks } from "./ranking";
import { round2 } from "./scoring";
import { compareClassInfo, compareStr } from "./utils";

export interface CumulativeSeries {
  key: string;
  label: string;
  values: number[];
}

export interface CumulativePenalty {
  weeks: string[];
  labels: string[];
  series: CumulativeSeries[];
}

/** values[k] = round2(Σ points of `incidents` with week ≤ weeks[k]); `weeks` ascending. */
function cumulate(incidents: readonly Incident[], weeks: readonly string[]): number[] {
  const sorted = incidents.map((i) => [i.week, i.points] as const).sort((a, b) => compareStr(a[0], b[0]));
  const out: number[] = [];
  let idx = 0;
  let acc = 0;
  for (const w of weeks) {
    while (idx < sorted.length && sorted[idx][0] <= w) acc += sorted[idx++][1];
    out.push(round2(acc));
  }
  return out;
}

/** Active classes matching the grade filter (and the class filter unless `ignoreClass`), display order. */
function activeInScope(ds: LevelDataset, f: GlobalFilters, ignoreClass = false): ClassInfo[] {
  const hasGrade = typeof f.grade === "number";
  return ds.classes
    .filter((c) => c.active && (!hasGrade || c.grade === f.grade) && (ignoreClass || !f.classCode || c.code === f.classCode))
    .sort(compareClassInfo);
}

/** Grades of the scope: class filter → that class's grade (when consistent with the grade filter); else active grades. */
function scopeGrades(ds: LevelDataset, f: GlobalFilters): number[] {
  if (f.classCode) {
    const cls = ds.classes.find((c) => c.code === f.classCode);
    if (cls) return typeof f.grade === "number" && f.grade !== cls.grade ? [] : [cls.grade];
  }
  return [...new Set(activeInScope(ds, f).map((c) => c.grade))].sort((a, b) => a - b);
}

/**
 * Cộng dồn điểm trừ by week across the school year: weeks = elapsedWeeksInPeriod(ALL_PERIOD, ds.weeks, today)
 * (holiday weeks included, value carried over); labels "dd/mm". Ignores f.period; honours grade, class, category,
 * error, group, student filters. values[k] = round2(Σ points of matching incidents with week ≤ weeks[k]).
 * - by "total" (default): one series, key "total", label `Lớp X` (class filter) | `Khối N` (grade filter) | "Toàn cấp".
 * - by "grade": one series per grade in scope (active classes; class filter → its grade), key `grade:N`, label `Khối N`.
 * - by "class": one series per class of `classCodes` (given order; default: active classes in scope, compareClassInfo
 *   order), key `class:CODE`, label `Lớp CODE`; the class filter does not restrict these series.
 * - gradeAverage: appends one series per grade of the returned series (all grades in scope for "total"), ascending:
 *   key `avg:N`, label `TB khối N` = cumulative penalty of all active classes of grade N (same filters except
 *   classCode / studentId) ÷ number of active classes of the grade (round2). Grades without active classes are skipped.
 */
export function cumulativePenalty(
  ds: LevelDataset,
  f: GlobalFilters,
  today: string,
  opts: { by?: "total" | "grade" | "class"; classCodes?: readonly string[]; gradeAverage?: boolean } = {},
): CumulativePenalty {
  const by = opts.by ?? "total";
  const weeks = elapsedWeeksInPeriod(ALL_PERIOD, ds.weeks, today).map((w) => w.weekStart);
  const labels = weeks.map(formatDayMonthVN);
  const series: CumulativeSeries[] = [];
  let avgGrades: number[] = [];

  if (by === "class") {
    const base = filterIncidents(ds, { ...f, period: ALL_PERIOD, classCode: undefined });
    const codes = [...new Set(opts.classCodes ?? activeInScope(ds, f, true).map((c) => c.code))];
    for (const code of codes) {
      series.push({ key: `class:${code}`, label: `Lớp ${code}`, values: cumulate(base.filter((i) => i.classCode === code), weeks) });
    }
    const gradeOf = new Map(ds.classes.map((c) => [c.code, c.grade] as const));
    avgGrades = [...new Set(codes.flatMap((code) => (gradeOf.has(code) ? [gradeOf.get(code) as number] : [])))];
  } else if (by === "grade") {
    const base = filterIncidents(ds, { ...f, period: ALL_PERIOD });
    avgGrades = scopeGrades(ds, f);
    for (const g of avgGrades) {
      series.push({ key: `grade:${g}`, label: `Khối ${g}`, values: cumulate(base.filter((i) => i.grade === g), weeks) });
    }
  } else {
    const label = f.classCode ? `Lớp ${f.classCode}` : typeof f.grade === "number" ? `Khối ${f.grade}` : "Toàn cấp";
    series.push({ key: "total", label, values: cumulate(filterIncidents(ds, { ...f, period: ALL_PERIOD }), weeks) });
    avgGrades = scopeGrades(ds, f);
  }

  if (opts.gradeAverage) {
    const scope: GlobalFilters = { ...f, period: ALL_PERIOD, classCode: undefined, studentId: undefined, grade: undefined };
    const base = filterIncidents(ds, scope);
    for (const g of [...avgGrades].sort((a, b) => a - b)) {
      const members = new Set(ds.classes.filter((c) => c.active && c.grade === g).map((c) => c.code));
      if (members.size === 0) continue;
      const totals = cumulate(base.filter((i) => members.has(i.classCode)), weeks);
      series.push({ key: `avg:${g}`, label: `TB khối ${g}`, values: totals.map((v) => round2(v / members.size)) });
    }
  }
  return { weeks, labels, series };
}

export interface RankHistoryClass {
  classCode: string;
  homeroomTeacher?: string;
  ranks: number[];
  scores: number[];
}

export interface RankHistory {
  grade: number;
  basis: "cumulative" | "week";
  weeks: string[];
  labels: string[];
  classes: RankHistoryClass[];
}

/**
 * Rank movement of every ACTIVE class of `grade` (population as BR-RANK-06), one point per counted elapsed week
 * (counted = true, weekStart ≤ Monday(today)) of the scope period, ascending:
 * scope = opts.period ?? ALL_PERIOD; a week period is widened with contextPeriod (its semester) and cut at that week.
 * - basis "cumulative" (default): score_k = baseScorePerWeek × (k + 1) + counted rewards − penalties of every record
 *   whose week is in the scope and ≤ weeks[k] (holiday weeks in between included) → equals buildRanking(scope).score at
 *   the last point when the scope's last elapsed week is counted.
 * - basis "week": score_k = baseScorePerWeek + counted rewards − penalties of weeks[k] only (as classScoreSeries).
 * ranks[k] = competitionRanks over the grade at week k (1 = best). Classes in compareClassInfo order.
 * Unknown grade → no classes; no counted week → weeks = [] and classes with empty arrays.
 */
export function rankHistory(
  ds: LevelDataset,
  grade: number,
  today: string,
  opts: { basis?: "cumulative" | "week"; period?: Period } = {},
): RankHistory {
  const basis = opts.basis ?? "cumulative";
  const period = opts.period ?? ALL_PERIOD;
  const context = contextPeriod(period, ds.weeks);
  const end = context.widened ? period.key : undefined;
  const weeks = elapsedWeeksInPeriod(context.period, ds.weeks, today)
    .filter((w) => w.counted && (end === undefined || w.weekStart <= end))
    .map((w) => w.weekStart);
  const classes = ds.classes.filter((c) => c.active && c.grade === grade).sort(compareClassInfo);
  const shell = (c: ClassInfo): RankHistoryClass => {
    const row: RankHistoryClass = { classCode: c.code, ranks: [], scores: [] };
    if (c.homeroomTeacher) row.homeroomTeacher = c.homeroomTeacher;
    return row;
  };
  const out: RankHistory = { grade, basis, weeks: [], labels: [], classes: classes.map(shell) };
  if (weeks.length === 0 || classes.length === 0) return out;

  // Net score change (counted rewards − penalties) per class, as [week, delta] entries of the scope.
  const members = new Set(classes.map((c) => c.code));
  const inScope = periodMatcher(context.period, ds.weeks);
  const deltas = new Map<string, Array<readonly [string, number]>>();
  const add = (code: string, week: string, delta: number) => {
    const list = deltas.get(code);
    if (list) list.push([week, delta]);
    else deltas.set(code, [[week, delta]]);
  };
  for (const i of ds.incidents) if (!i.deletedAt && members.has(i.classCode) && inScope(i)) add(i.classCode, i.week, -i.points);
  for (const r of countedRewards(ds.rewards, ds.config)) {
    if (!r.deletedAt && members.has(r.classCode) && inScope(r)) add(r.classCode, r.week, r.points);
  }

  const base = ds.config.baseScorePerWeek;
  const scores = classes.map((c) => {
    const list = [...(deltas.get(c.code) ?? [])].sort((a, b) => compareStr(a[0], b[0]));
    if (basis === "week") {
      return weeks.map((w) => round2(base + list.reduce((s, [week, d]) => (week === w ? s + d : s), 0)));
    }
    let idx = 0;
    let acc = 0;
    return weeks.map((w, k) => {
      while (idx < list.length && list[idx][0] <= w) acc += list[idx++][1];
      return round2(base * (k + 1) + acc);
    });
  });
  const ranksByWeek = weeks.map((_, k) => competitionRanks(scores.map((s) => s[k])));
  out.weeks = weeks;
  out.labels = weeks.map(formatDayMonthVN);
  out.classes = classes.map((c, idx) => ({ ...shell(c), scores: scores[idx], ranks: ranksByWeek.map((r) => r[idx]) }));
  return out;
}
