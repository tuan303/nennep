/**
 * Pure view-model helpers of the "Tổng quan" dashboard. No React. Business numbers always come from the engine;
 * these helpers only shape them for display (labels, tones, windows, ordering).
 */
import type { Tone } from "@/components/ui/tones";
import { topIssues, type ClassStat, type IssueStat, type Kpis, type TrendPoint } from "@/lib/engine/analytics";
import { countedRewards, filterRewards } from "@/lib/engine/filters";
import { weeksInPeriod } from "@/lib/engine/period";
import { findRankingRow } from "@/lib/engine/ranking";
import { round2 } from "@/lib/engine/scoring";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
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
 * Filters of the two widgets that set a filter by clicking ("Phân bổ theo mảng", "Top 5 vấn đề"): each ignores its
 * own dimension so the other slices / rows stay visible next to the selected one (highlighted), the usual
 * cross-filter behaviour. The Mảng chart also ignores the error (an error belongs to exactly one Mảng).
 */
export function crossFilterScopes(filters: GlobalFilters): { category: GlobalFilters; error: GlobalFilters } {
  return {
    category: { ...filters, category: undefined, errorCode: undefined },
    error: { ...filters, errorCode: undefined },
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

export type KpiId = "incidents" | "students" | "penalty" | "reward" | "classes" | "confidence";

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
  /** Active classes in scope (grade/class filters). */
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

/** The 6 KPI tiles of SCR-02, in display order. */
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
      label: "Sự việc",
      value: c.incidents,
      tone: "brand",
      delta: delta(diff(c.incidents, p?.incidents), "down"),
      hint: "Số sự việc nền nếp được ghi nhận trong phạm vi đang lọc.",
      spark: spark.incidents,
    },
    {
      id: "students",
      label: "HS liên quan",
      value: c.relatedStudents,
      tone: "muted",
      delta: delta(diff(c.relatedStudents, p?.relatedStudents), "down"),
      hint:
        `Tổng lượt học sinh liên quan (gồm cả HS chưa rõ tên). ${fmtNumber(c.uniqueStudents)} học sinh khác nhau được ghi tên` +
        (c.unnamedStudentCount > 0 ? `; ${fmtNumber(c.unnamedStudentCount)} lượt chưa rõ tên.` : "."),
      note: `${fmtNumber(c.uniqueStudents)} học sinh khác nhau`,
      spark: spark.students,
    },
    {
      id: "penalty",
      label: "Điểm trừ",
      value: c.penaltyPoints,
      unit: "điểm",
      tone: "bad",
      delta: delta(diff(c.penaltyPoints, p?.penaltyPoints), "down"),
      hint: "Tổng điểm trừ của các sự việc trong phạm vi đang lọc (tính theo quy tắc /HS và /lần).",
      spark: spark.penalty,
    },
    {
      id: "reward",
      label: "Điểm thưởng",
      value: c.rewardPoints,
      unit: "điểm",
      tone: "star",
      delta: delta(diff(c.rewardPoints, p?.rewardPoints), "up"),
      hint:
        `Chỉ tính điểm thưởng có trạng thái: ${statuses}.` +
        (pending.count > 0 ? ` Còn ${fmtNumber(pending.points)} điểm (${fmtNumber(pending.count)} bản ghi) đang chờ xác minh.` : ""),
      note: pending.count > 0 ? `${fmtNumber(pending.points)} điểm chờ xác minh` : undefined,
      spark: spark.reward,
    },
    {
      id: "classes",
      label: "Lớp phát sinh",
      value: `${fmtNumber(c.classesWithIncidents)}/${fmtNumber(input.classTotal)}`,
      unit: "lớp",
      tone: "warn",
      delta: delta(diff(c.classesWithIncidents, p?.classesWithIncidents), "down"),
      hint: "Số lớp có ít nhất một sự việc trong kỳ / tổng số lớp đang hoạt động trong phạm vi lọc.",
      spark: spark.classes,
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

/** RAG counts over the ranking population (all active classes, or one grade). The class filter only highlights. */
export function ragSummary(grades: readonly GradeRanking[], grade?: number): RagSummary {
  const rows = grades.filter((g) => typeof grade !== "number" || g.grade === grade).flatMap((g) => g.rows);
  const counts: Record<RagStatus, number> = { GREEN: 0, YELLOW: 0, RED: 0, GRAY: 0 };
  for (const r of rows) counts[r.rag]++;
  const sorted = [...rows].sort((a, b) => SEVERITY[a.rag] - SEVERITY[b.rag] || b.avgWeeklyPenalty - a.avgWeeklyPenalty);
  return { counts, total: rows.length, rows: sorted, highlighted: rows.find((r) => r.highlighted) };
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
