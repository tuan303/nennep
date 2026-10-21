/**
 * Pure view-model helpers of the "Toàn trường" screen: per-level period resolution (each level has its own calendar),
 * per-level summaries, normalised comparisons and school-wide merges. All numbers come from the engine.
 */
import { LEVELS, LEVEL_THEME } from "@/lib/constants";
import { kpiComparison, studentStats, topIssues, weeklyTrend, type IssueStat, type Kpis, type TrendPoint } from "@/lib/engine/analytics";
import { formatDayMonthVN } from "@/lib/engine/dates";
import { filterIncidents } from "@/lib/engine/filters";
import { ALL_PERIOD, defaultPeriod, periodLabel, periodOptions, type PeriodOption } from "@/lib/engine/period";
import { buildRanking } from "@/lib/engine/ranking";
import { round2 } from "@/lib/engine/scoring";
import { naturalCompare } from "@/lib/engine/text";
import type { LevelDataset, LevelId, Period, PeriodMode, RagStatus, RankingRow, Unit } from "@/lib/types";

export type SchoolPeriodMode = PeriodMode;

export const SCHOOL_PERIOD_OPTIONS: ReadonlyArray<{ value: SchoolPeriodMode; label: string; short: string }> = [
  { value: "week", label: "Tuần hiện tại", short: "Tuần" },
  { value: "month", label: "Tháng hiện tại", short: "Tháng" },
  { value: "semester", label: "Học kỳ hiện tại", short: "Học kỳ" },
  { value: "all", label: "Toàn bộ năm học", short: "Cả năm" },
];

/** Stable colour slot per level (charts). */
// Level colours = NSHM level identity (same as the "Phiếu đánh giá giờ dạy" app); chart series shades.
export const LEVEL_COLOR: Record<LevelId, string> = { TH: LEVEL_THEME.TH.series, THCS: LEVEL_THEME.THCS.series, THPT: LEVEL_THEME.THPT.series };

function pickKey(options: PeriodOption[]): string | undefined {
  const current = options.find((o) => o.isCurrent);
  if (current) return current.key;
  const past = options.filter((o) => !o.isFuture);
  return (past.length ? past[past.length - 1] : options[0])?.key;
}

/**
 * The "current" period of a level for a mode, from its own calendar: week = engine defaultPeriod (current or last
 * past week); month/semester = the current option, else the last past one. Falls back to the whole year.
 */
export function levelPeriod(ds: Pick<LevelDataset, "weeks" | "config">, mode: SchoolPeriodMode, today: string): Period {
  if (mode === "all") return ALL_PERIOD;
  if (mode === "week") return defaultPeriod(ds.weeks, today);
  const opts = periodOptions(ds.weeks, ds.config.semesters, today);
  const key = pickKey(mode === "month" ? opts.months : opts.semesters);
  return key ? { mode, key } : ALL_PERIOD;
}

/** Students used for normalisation: ACTIVE roster; for redacted datasets (GVCN) the class sizes from the source. */
export function levelStudentCount(ds: Pick<LevelDataset, "students" | "classes" | "redacted">): number | undefined {
  if (!ds.redacted) return ds.students.filter((s) => s.status === "ACTIVE").length;
  const active = ds.classes.filter((c) => c.active);
  if (active.length === 0 || active.some((c) => typeof c.sourceSize !== "number")) return undefined;
  return active.reduce((a, c) => a + (c.sourceSize ?? 0), 0);
}

export interface LevelSummary {
  levelId: LevelId;
  name: string;
  period: Period;
  periodLabel: string;
  classCount: number;
  studentCount?: number;
  kpis: Kpis;
  /** KPIs of the previous period of the same mode (undefined for the whole year / the first period). */
  previous?: Kpis;
  countedWeeks: number;
  rag: Record<RagStatus, number>;
  /** Highest competition score of the level (ties: fewer penalty points, then class code). */
  best?: RankingRow;
  /** Most worrying class: RED first, then YELLOW, by average weekly penalty; else the highest penalty (> 0). */
  attention?: RankingRow;
  redClasses: RankingRow[];
  yellowCount: number;
  weeklyRedStudents: number;
  repeatStudents: number;
  /** Incidents per 100 students (undefined without a student count). */
  incidentsPer100?: number;
  penaltyPerClass: number;
  rewardPerClass: number;
}

const SEVERITY: Record<RagStatus, number> = { RED: 0, YELLOW: 1, GREEN: 2, GRAY: 3 };

export function bestClass(rows: readonly RankingRow[]): RankingRow | undefined {
  return [...rows].sort((a, b) => b.score - a.score || a.penaltyPoints - b.penaltyPoints || naturalCompare(a.classCode, b.classCode))[0];
}

export function attentionClass(rows: readonly RankingRow[]): RankingRow | undefined {
  const flagged = rows
    .filter((r) => r.rag === "RED" || r.rag === "YELLOW")
    .sort((a, b) => SEVERITY[a.rag] - SEVERITY[b.rag] || b.avgWeeklyPenalty - a.avgWeeklyPenalty || naturalCompare(a.classCode, b.classCode));
  if (flagged.length) return flagged[0];
  return [...rows]
    .filter((r) => r.penaltyPoints > 0)
    .sort((a, b) => b.penaltyPoints - a.penaltyPoints || naturalCompare(a.classCode, b.classCode))[0];
}

export function levelSummary(ds: LevelDataset, mode: SchoolPeriodMode, today: string): LevelSummary {
  const period = levelPeriod(ds, mode, today);
  const { current: kpis, previous } = kpiComparison(ds, { period });
  const ranking = buildRanking(ds, period, today);
  const rows = ranking.grades.flatMap((g) => g.rows);
  const rag: Record<RagStatus, number> = { GREEN: 0, YELLOW: 0, RED: 0, GRAY: 0 };
  for (const r of rows) rag[r.rag]++;
  const students = studentStats(ds, { period }, today);
  const classCount = ds.classes.filter((c) => c.active).length;
  const studentCount = levelStudentCount(ds);
  return {
    levelId: ds.levelId,
    name: LEVELS[ds.levelId].name,
    period,
    periodLabel: periodLabel(period, ds.config.semesters),
    classCount,
    studentCount,
    kpis,
    previous,
    countedWeeks: ranking.countedWeeks,
    rag,
    best: bestClass(rows),
    attention: attentionClass(rows),
    redClasses: rows.filter((r) => r.rag === "RED").sort((a, b) => b.avgWeeklyPenalty - a.avgWeeklyPenalty),
    yellowCount: rag.YELLOW,
    weeklyRedStudents: students.filter((s) => s.alert === "WEEKLY_RED").length,
    repeatStudents: students.filter((s) => s.alert === "REPEAT").length,
    incidentsPer100: studentCount ? round2((kpis.incidents / studentCount) * 100) : undefined,
    penaltyPerClass: classCount ? round2(kpis.penaltyPoints / classCount) : 0,
    rewardPerClass: classCount ? round2(kpis.rewardPoints / classCount) : 0,
  };
}

/* ------------------------------ School merges ----------------------------- */

export interface SchoolTotals {
  levels: number;
  incidents: number;
  /** Σ Lượt vi phạm (KPI_TERMS.violationTurns) of the levels. */
  violationTurns: number;
  penaltyPoints: number;
  rewardPoints: number;
  classCount: number;
  /** Undefined when one level has no student count. */
  studentCount?: number;
  redClasses: number;
  yellowClasses: number;
  weeklyRedStudents: number;
  repeatStudents: number;
  /** Sums of the previous periods – only when every level has one. */
  previous?: { incidents: number; penaltyPoints: number; rewardPoints: number };
}

/** School-wide sums of the level summaries (each level in its own current period). */
export function schoolTotals(summaries: readonly LevelSummary[]): SchoolTotals {
  const sum = (f: (s: LevelSummary) => number) => round2(summaries.reduce((a, s) => a + f(s), 0));
  const allPrev = summaries.length > 0 && summaries.every((s) => s.previous);
  const allStudents = summaries.length > 0 && summaries.every((s) => typeof s.studentCount === "number");
  return {
    levels: summaries.length,
    incidents: sum((s) => s.kpis.incidents),
    violationTurns: sum((s) => s.kpis.violationTurns),
    penaltyPoints: sum((s) => s.kpis.penaltyPoints),
    rewardPoints: sum((s) => s.kpis.rewardPoints),
    classCount: sum((s) => s.classCount),
    studentCount: allStudents ? sum((s) => s.studentCount ?? 0) : undefined,
    redClasses: sum((s) => s.rag.RED),
    yellowClasses: sum((s) => s.rag.YELLOW),
    weeklyRedStudents: sum((s) => s.weeklyRedStudents),
    repeatStudents: sum((s) => s.repeatStudents),
    previous: allPrev
      ? {
          incidents: sum((s) => s.previous?.incidents ?? 0),
          penaltyPoints: sum((s) => s.previous?.penaltyPoints ?? 0),
          rewardPoints: sum((s) => s.previous?.rewardPoints ?? 0),
        }
      : undefined,
  };
}

/** Incidents of every level in its period (for school-wide engine calls such as dataConfidence). */
export function schoolIncidents(levels: ReadonlyArray<{ ds: LevelDataset; period: Period }>) {
  return levels.flatMap(({ ds, period }) => filterIncidents(ds, { period }));
}

export interface MergedIssue {
  key: string;
  errorCode: string;
  issue: string;
  category: string;
  unit: Unit;
  incidents: number;
  points: number;
  students: number;
  classCount: number;
  levels: Array<{ levelId: LevelId; incidents: number }>;
}

/** Issues of every level merged by error code + issue text (codes may differ in meaning between levels). */
export function mergeTopIssues(perLevel: ReadonlyArray<{ levelId: LevelId; issues: readonly IssueStat[] }>, n = 5): MergedIssue[] {
  const map = new Map<string, MergedIssue>();
  for (const { levelId, issues } of perLevel) {
    for (const s of issues) {
      const key = `${s.errorCode}|${s.issue.trim().toLocaleLowerCase("vi")}`;
      const m = map.get(key);
      if (m) {
        m.incidents += s.incidents;
        m.points = round2(m.points + s.points);
        m.students += s.students;
        m.classCount += s.classCount;
        m.levels.push({ levelId, incidents: s.incidents });
      } else {
        map.set(key, {
          key,
          errorCode: s.errorCode,
          issue: s.issue,
          category: s.category,
          unit: s.unit,
          incidents: s.incidents,
          points: s.points,
          students: s.students,
          classCount: s.classCount,
          levels: [{ levelId, incidents: s.incidents }],
        });
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.incidents - a.incidents || b.points - a.points || naturalCompare(a.errorCode, b.errorCode))
    .slice(0, Math.max(0, n));
}

/** All issues of a level in its period (engine topIssues on the filtered incidents). */
export function levelIssues(ds: LevelDataset, period: Period): IssueStat[] {
  return topIssues(filterIncidents(ds, { period }), Number.POSITIVE_INFINITY);
}

export type TrendMetric = "perClass" | "total";

export interface MergedTrend {
  weeks: string[];
  categories: string[];
  series: Array<{ levelId: LevelId; name: string; color: string; data: Array<number | null> }>;
}

/**
 * One series per level over the union of elapsed weeks (calendars may differ). `perClass` divides each week's
 * penalty points by the level's active class count so levels of different sizes are comparable.
 */
export function mergeWeeklyTrends(
  perLevel: ReadonlyArray<{ levelId: LevelId; trend: readonly TrendPoint[]; classCount: number }>,
  metric: TrendMetric,
): MergedTrend {
  const weeks = [...new Set(perLevel.flatMap((l) => l.trend.map((t) => t.week)))].sort();
  return {
    weeks,
    categories: weeks.map(formatDayMonthVN),
    series: perLevel.map(({ levelId, trend, classCount }) => {
      const byWeek = new Map(trend.map((t) => [t.week, t] as const));
      return {
        levelId,
        name: LEVELS[levelId].short,
        color: LEVEL_COLOR[levelId],
        data: weeks.map((w) => {
          const t = byWeek.get(w);
          if (!t) return null;
          return metric === "perClass" ? (classCount ? round2(t.points / classCount) : 0) : t.points;
        }),
      };
    }),
  };
}

/** Weekly trend of a whole level (no filter). */
export function levelTrend(ds: LevelDataset, today: string): TrendPoint[] {
  return weeklyTrend(ds, { period: ALL_PERIOD }, today);
}
