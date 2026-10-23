/**
 * Pure view-model helpers of the "Tổng quan" dashboard. No React. Business numbers always come from the engine;
 * these helpers only shape them for display (labels, tones, windows, ordering).
 */
import type { Tone } from "@/components/ui/tones";
import { topIssues, type ClassStat, type IssueStat, type Kpis, type TrendPoint } from "@/lib/engine/analytics";
import { countedRewards, filterRewards } from "@/lib/engine/filters";
import { weeksInPeriod } from "@/lib/engine/period";
import { findRankingRow, LEVEL_RANKING_GROUP, rankingGroupLabel, rankingRuleOf } from "@/lib/engine/ranking";
import { round2 } from "@/lib/engine/scoring";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { KPI_TERMS } from "@/lib/constants";
import type {
  CatalogItem,
  GlobalFilters,
  Incident,
  GradeRanking,
  LevelDataset,
  LevelId,
  Period,
  PeriodMode,
  RagStatus,
  RankingRow,
  SchoolWeek,
  UserProfile,
} from "@/lib/types";

/* ----------------------------- cross-filtering ----------------------------- */

/**
 * Filters of the widgets that set a filter by clicking ("Phân bổ theo mảng", "Top 5 vấn đề", "Theo nhóm lỗi"): each
 * ignores its own dimension so the other slices / rows / bars stay visible next to the selected one (highlighted), the
 * usual cross-filter behaviour. The Mảng and group charts also ignore the error (an error belongs to exactly one Mảng
 * and one group). Every other filter (period, khối, lớp, học sinh…) is carried over by the spread.
 */
export function crossFilterScopes(filters: GlobalFilters): { category: GlobalFilters; error: GlobalFilters; group: GlobalFilters } {
  return {
    category: { ...filters, category: undefined, errorCode: undefined },
    error: { ...filters, errorCode: undefined },
    group: { ...filters, group: undefined, errorCode: undefined },
  };
}

/** Mảng to emphasise in the donut: the Mảng filter, else the Mảng of the filtered error. */
export function selectedCategory(filters: Pick<GlobalFilters, "category" | "errorCode">, catalog: readonly Pick<CatalogItem, "code" | "category">[]): string | undefined {
  if (filters.category) return filters.category;
  return filters.errorCode ? catalog.find((c) => c.code === filters.errorCode)?.category : undefined;
}

export type RankedIssue = IssueStat & { rank: number };

/** Top `n` errors (engine topIssues); the selected error is appended with its real rank when it is not among them. */
export function topIssueRows(incidents: Incident[], selected: string | undefined, n = 5): RankedIssue[] {
  const all = topIssues(incidents, Number.POSITIVE_INFINITY);
  const rows = all.slice(0, n).map((s, i) => ({ ...s, rank: i + 1 }));
  if (selected && !rows.some((r) => r.errorCode === selected)) {
    const idx = all.findIndex((s) => s.errorCode === selected);
    if (idx >= 0) rows.push({ ...all[idx], rank: idx + 1 });
  }
  return rows;
}

/* --------------------------------- KPIs ---------------------------------- */

/** KPI tiles of Tổng quan (REQ_V2 §6.2): the 4 shared vocabulary numbers (KPI_TERMS) + Điểm thưởng + Độ tin cậy. */
export type KpiId = "incidents" | "turns" | "students" | "penalty" | "reward" | "confidence";

export interface KpiDeltaView {
  value: number;
  goodWhen: "up" | "down";
  label?: string;
  display?: string;
}

export interface KpiView {
  id: KpiId;
  label: string;
  value: string | number;
  unit?: string;
  tone: Tone;
  delta?: KpiDeltaView;
  /** Tooltip text (ⓘ). */
  hint: string;
  /** Short visible line under the delta. */
  note?: string;
  spark: number[];
}

/** Ordered tile ids. */
export const KPI_IDS: readonly KpiId[] = ["incidents", "turns", "students", "penalty", "reward", "confidence"];

/** "so với tuần trước" … – undefined for the whole school year (no previous period). */
export function deltaLabel(mode: PeriodMode): string | undefined {
  switch (mode) {
    case "week":
      return "so với tuần trước";
    case "month":
      return "so với tháng trước";
    case "semester":
      return "so với học kỳ trước";
    default:
      return undefined;
  }
}

/** ok when confidence ≥ threshold, warn when within 10 points below it, bad otherwise. */
export function confidenceTone(confidence: number, minConfidence: number): Tone {
  if (confidence >= minConfidence) return "ok";
  if (confidence >= minConfidence - 0.1) return "warn";
  return "bad";
}

export interface KpiViewInput {
  current: Kpis;
  previous?: Kpis;
  mode: PeriodMode;
  /** Active classes in scope (grade/class filters) – denominator of "n/N lớp phát sinh". */
  classTotal: number;
  minConfidence: number;
  /** Rewards of the scope whose status is not counted yet. */
  pendingReward: { points: number; count: number };
  countedStatuses: readonly string[];
  /** Per-KPI sparkline values (oldest → newest). */
  spark: Record<KpiId, number[]>;
}

function diff(cur: number, prev: number | undefined): number | undefined {
  return prev === undefined ? undefined : round2(cur - prev);
}

/**
 * The 6 KPI tiles of Tổng quan, in display order. Labels and tooltips of Sự việc, Lượt vi phạm, Số HS vi phạm and
 * Điểm trừ are exactly the shared KPI_TERMS (same text on every screen, REQ_V2 §13).
 */
export function buildKpiViews(input: KpiViewInput): KpiView[] {
  const { current: c, previous: p, mode, spark } = input;
  const label = deltaLabel(mode);
  const delta = (value: number | undefined, goodWhen: "up" | "down", display?: string): KpiDeltaView | undefined =>
    value === undefined ? undefined : { value, goodWhen, label, ...(display ? { display } : {}) };

  const confDelta = p ? round2((c.confidence - p.confidence) * 100) : undefined;
  const confDisplay =
    confDelta === undefined ? undefined : confDelta === 0 ? "0 điểm %" : `${confDelta > 0 ? "+" : "−"}${fmtNumber(Math.abs(confDelta), 1)} điểm %`;
  const statuses = input.countedStatuses.join(", ") || "–";
  const pending = input.pendingReward;

  return [
    {
      id: "incidents",
      label: KPI_TERMS.incidents.label,
      value: c.incidents,
      tone: "brand",
      delta: delta(diff(c.incidents, p?.incidents), "down"),
      hint: KPI_TERMS.incidents.hint,
      note: `${fmtNumber(c.classesWithIncidents)}/${fmtNumber(input.classTotal)} lớp phát sinh`,
      spark: spark.incidents,
    },
    {
      id: "turns",
      label: KPI_TERMS.violationTurns.label,
      value: c.violationTurns,
      tone: "warn",
      delta: delta(diff(c.violationTurns, p?.violationTurns), "down"),
      hint: KPI_TERMS.violationTurns.hint,
      spark: spark.turns,
    },
    {
      id: "students",
      label: KPI_TERMS.uniqueStudents.label,
      value: c.uniqueStudents,
      tone: "muted",
      delta: delta(diff(c.uniqueStudents, p?.uniqueStudents), "down"),
      hint: KPI_TERMS.uniqueStudents.hint,
      note: c.unnamedStudentCount > 0 ? `+ ${fmtNumber(c.unnamedStudentCount)} HS chưa rõ tên` : undefined,
      spark: spark.students,
    },
    {
      id: "penalty",
      label: KPI_TERMS.penaltyPoints.label,
      value: c.penaltyPoints,
      unit: "điểm",
      tone: "bad",
      delta: delta(diff(c.penaltyPoints, p?.penaltyPoints), "down"),
      hint: KPI_TERMS.penaltyPoints.hint,
      spark: spark.penalty,
    },
    {
      id: "reward",
      label: KPI_TERMS.rewardPoints.label,
      value: c.rewardPoints,
      unit: "điểm",
      tone: "star",
      delta: delta(diff(c.rewardPoints, p?.rewardPoints), "up"),
      hint:
        `${KPI_TERMS.rewardPoints.hint} Đang tính: ${statuses}.` +
        (pending.count > 0 ? ` Còn ${fmtNumber(pending.points)} điểm (${fmtNumber(pending.count)} bản ghi) đang chờ xác minh.` : ""),
      note: pending.count > 0 ? `${fmtNumber(pending.points)} điểm chờ xác minh` : undefined,
      spark: spark.reward,
    },
    {
      id: "confidence",
      label: "Độ tin cậy dữ liệu",
      value: fmtPercent(c.confidence, 1),
      tone: confidenceTone(c.confidence, input.minConfidence),
      delta: confDelta === undefined ? undefined : delta(confDelta, "up", confDisplay),
      hint:
        `(Hợp lệ + Thiếu tên HS) / tổng sự việc trong phạm vi lọc. Ngưỡng tối thiểu: ${fmtPercent(input.minConfidence)}.` +
        (c.reviewCount > 0 ? ` ${fmtNumber(c.reviewCount)} bản ghi cần rà soát.` : ""),
      note: c.reviewCount > 0 ? `${fmtNumber(c.reviewCount)} bản ghi cần rà soát` : "Không có bản ghi cần rà soát",
      spark: spark.confidence,
    },
  ];
}

/** Rewards of the filtered scope that are not counted yet (status outside config.rewardCountedStatuses). */
export function pendingRewards(ds: LevelDataset, f: GlobalFilters): { points: number; count: number } {
  const all = filterRewards(ds, f);
  const counted = new Set(countedRewards(all, ds.config).map((r) => r.id));
  const pending = all.filter((r) => !counted.has(r.id));
  return { points: round2(pending.reduce((a, r) => a + r.points, 0)), count: pending.length };
}

/* ------------------------------ Trend window ------------------------------ */

/** Week keys (Monday dates) of a non-"all" period; empty for "all". */
export function periodWeekSet(period: Period, weeks: SchoolWeek[]): Set<string> {
  if (period.mode === "all" || !period.key) return new Set();
  return new Set(weeksInPeriod(period, weeks).map((w) => w.weekStart));
}

/** Per trend point: is it inside the selected period? (all false for "all"). */
export function trendHighlight(trend: readonly TrendPoint[], period: Period, weeks: SchoolWeek[]): boolean[] {
  const set = periodWeekSet(period, weeks);
  return trend.map((t) => set.has(t.week));
}

/**
 * The `size` most recent trend weeks ending with the last elapsed week of the period (or the latest week when the
 * period is "all" or has no elapsed week yet) – used for KPI sparklines.
 */
export function sparkWeeks(trend: readonly TrendPoint[], period: Period, weeks: SchoolWeek[], size = 8): string[] {
  if (trend.length === 0) return [];
  const flags = trendHighlight(trend, period, weeks);
  let end = flags.lastIndexOf(true);
  if (end < 0) end = trend.length - 1;
  return trend.slice(Math.max(0, end - size + 1), end + 1).map((t) => t.week);
}

/**
 * Wider period giving context to week-based charts (heatmap, 5S trend, recidivism): a week is widened to its
 * semester (or the whole year when the week is outside every semester). Same function as the engine's (the class
 * recidivism of `recidivism()` uses it too), re-exported so the dashboard and the Decision Brief always agree.
 */
export { contextPeriod } from "@/lib/engine/period";

/* ---------------------------------- RAG ---------------------------------- */

export const RAG_ORDER: readonly RagStatus[] = ["RED", "YELLOW", "GREEN", "GRAY"];

export interface RagSummary {
  counts: Record<RagStatus, number>;
  total: number;
  /** Population rows (grade-filtered), sorted by severity then penalty. */
  rows: RankingRow[];
  highlighted?: RankingRow;
}

const SEVERITY: Record<RagStatus, number> = { RED: 0, YELLOW: 1, GREEN: 2, GRAY: 3 };

/**
 * RAG counts over the ranking population (all active classes, or one khối). Filtered on the rows' own grade, so it also
 * works on a level-wide table (THPT: one group, grade = LEVEL_RANKING_GROUP). The class filter only highlights.
 */
export function ragSummary(grades: readonly GradeRanking[], grade?: number): RagSummary {
  const rows = grades.flatMap((g) => g.rows).filter((r) => typeof grade !== "number" || r.grade === grade);
  const counts: Record<RagStatus, number> = { GREEN: 0, YELLOW: 0, RED: 0, GRAY: 0 };
  for (const r of rows) counts[r.rag]++;
  const sorted = [...rows].sort((a, b) => SEVERITY[a.rag] - SEVERITY[b.rag] || b.avgWeeklyPenalty - a.avgWeeklyPenalty);
  return { counts, total: rows.length, rows: sorted, highlighted: rows.find((r) => r.highlighted) };
}

/* --------------------------------- Rank ---------------------------------- */

/** Lower-case name of the ranking group of a class of `grade`: "khối 6", or "toàn cấp" when the level ranks as a whole (THPT). */
export function rankingGroupText(levelId: LevelId, grade: number): string {
  return rankingGroupLabel(rankingRuleOf(levelId).scope === "level" ? LEVEL_RANKING_GROUP : grade).toLocaleLowerCase("vi");
}

/** "Hạng 2/5 khối 6" | "Hạng 3/15 toàn cấp" (THPT): rank inside the class's ranking group (gradeClassCount = its size). */
export function rankText(row: Pick<RankingRow, "rank" | "gradeClassCount" | "grade">, levelId: LevelId): string {
  return `Hạng ${fmtNumber(row.rank)}/${fmtNumber(row.gradeClassCount)} ${rankingGroupText(levelId, row.grade)}`;
}

/* ----------------------------- Priority classes --------------------------- */

export interface PriorityClass extends ClassStat {
  row?: RankingRow;
}

/** Classes with incidents in scope, in engine order (points desc, incidents desc), joined with their ranking row. */
export function priorityClasses(stats: readonly ClassStat[], ranking: { grades: GradeRanking[] }, n = 5): PriorityClass[] {
  return stats
    .filter((s) => s.incidents > 0 || s.points > 0)
    .slice(0, n)
    .map((s) => ({ ...s, row: findRankingRow(ranking, s.classCode) }));
}

/** Ranking rows of the GVCN's own classes in this level (empty for other roles). */
export function myClassRows(
  profile: Pick<UserProfile, "role" | "gvcnClasses"> | undefined,
  levelId: LevelId,
  ranking: { grades: GradeRanking[] },
): RankingRow[] {
  if (!profile || profile.role !== "GVCN") return [];
  return profile.gvcnClasses
    .filter((c) => c.levelId === levelId)
    .map((c) => findRankingRow(ranking, c.classCode))
    .filter((r): r is RankingRow => r !== undefined);
}
