/**
 * Pure view-model helpers of the "Xếp hạng" screen. Every business number (score, rank, Top 90%, RAG, confidence)
 * comes from the engine; this file only groups, counts and formats engine output for display.
 */
import {
  LEVEL_RANKING_GROUP,
  countedRewards,
  filterIncidents,
  filterRewards,
  mondayOf,
  round2,
  topIssues,
  namedTop,
  weeksInPeriod,
  type IssueStat,
  type RankingRule,
} from "@/lib/engine";
import type { GradeRanking, Incident, LevelDataset, Period, PeriodMode, RagStatus, RankingRow, Reward, SchoolWeek } from "@/lib/types";

/** In-page anchor of a ranking table / movement card: "khoi-6", or "toan-cap" for a level-wide ranking (THPT). */
export function rankingGroupAnchor(group: number): string {
  return group === LEVEL_RANKING_GROUP ? "toan-cap" : `khoi-${group}`;
}

/** Who a class is ranked against, inside a sentence: "các lớp của khối" / "các lớp của cấp học" (RankingRule.scope). */
export function rankingPopulationText(rule: Pick<RankingRule, "scope">): string {
  return rule.scope === "level" ? "các lớp của cấp học" : "các lớp của khối";
}

/**
 * Short note of a level with its own ranking rule (THPT), shown above the tables; undefined for the default rule
 * (one table per khối, equal scores share a rank) so TH / THCS screens stay as they were.
 */
export function rankingRuleNote(rule: RankingRule, levelShort: string): string | undefined {
  if (rule.scope === "grade" && rule.tieBreak === "none" && !rule.topCount) return undefined;
  const parts = [
    rule.scope === "level" ? `Cấp ${levelShort} xếp hạng chung tất cả các lớp, không chia theo khối.` : `Cấp ${levelShort} xếp hạng trong từng khối.`,
  ];
  if (rule.tieBreak === "violationTurns") {
    parts.push("Bằng điểm: lớp có ít lượt vi phạm hơn xếp trên; bằng cả điểm và lượt vi phạm (ví dụ các lớp không bị trừ lỗi nào) thì đồng hạng.");
  }
  if (rule.topCount) {
    parts.push(`Báo cáo nêu ${rule.topCount} lớp dẫn đầu${rule.scope === "level" ? " toàn cấp" : ""} (gồm cả các lớp đồng hạng ở vị trí cuối).`);
  }
  return parts.join(" ");
}

/**
 * Classes named by the reports (RankingRule.topCount – THPT: first 3, every class tied at the cut included), by the
 * shared engine rule (namedTop): [] without a counted week, or when the tie covers the whole table (`allTied`).
 */
export function rankingLeaders(rows: readonly RankingRow[], rule: Pick<RankingRule, "topCount">): RankingRow[] {
  return namedTop(rows, rule.topCount).rows;
}

export interface GradeSummary {
  grade: number;
  classCount: number;
  /** Last rank still inside Top 90% (BR-RANK-05). */
  cutoff: number;
  /** Mean competition score of the grade (0 when the grade has no class). */
  avgScore: number;
  /** Classes "Ngoài Top 90%". */
  outsideCount: number;
  /** Number of classes per RAG colour. */
  rag: Record<RagStatus, number>;
}

export function gradeSummary(g: GradeRanking): GradeSummary {
  const rag: Record<RagStatus, number> = { GREEN: 0, YELLOW: 0, RED: 0, GRAY: 0 };
  let total = 0;
  let outside = 0;
  for (const r of g.rows) {
    rag[r.rag]++;
    total += r.score;
    if (!r.inTop90) outside++;
  }
  const count = g.rows.length;
  return {
    grade: g.grade,
    classCount: count,
    cutoff: g.rows[0]?.top90Cutoff ?? 0,
    avgScore: count ? round2(total / count) : 0,
    outsideCount: outside,
    rag,
  };
}

/**
 * Where the "Ngưỡng Top 90%" divider goes: index of the first row outside Top 90% when at least one row before it is
 * inside. -1 when every row is inside, or none is (no boundary to show). Rows must be sorted by rank (engine order).
 */
export function top90DividerIndex(rows: readonly RankingRow[]): number {
  const idx = rows.findIndex((r) => !r.inTop90);
  return idx > 0 ? idx : -1;
}

/**
 * Rank movement per class vs a previous ranking: previous rank − current rank (positive = moved up).
 * Classes that were not ranked in the previous period are absent from the map.
 */
export function rankDeltas(current: readonly GradeRanking[], previous: readonly GradeRanking[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!previous) return out;
  const before = new Map<string, number>();
  for (const g of previous) for (const r of g.rows) before.set(r.classCode, r.rank);
  for (const g of current) {
    for (const r of g.rows) {
      const prev = before.get(r.classCode);
      if (prev !== undefined) out.set(r.classCode, prev - r.rank);
    }
  }
  return out;
}

export interface ClassBreakdown {
  /** Incidents of the class in the period (every error – the ranking ignores category/error filters). */
  incidents: Incident[];
  /** Penalty breakdown by error: incidents desc, points desc (engine topIssues). */
  issues: IssueStat[];
  /** Rewards counted in the score (config.rewardCountedStatuses). */
  counted: Reward[];
  /** Rewards of the period still waiting for verification (not counted). */
  pending: Reward[];
  /** Incidents flagged "Cần rà soát". */
  reviewCount: number;
  /** Incidents flagged "Thiếu tên HS". */
  unnamedCount: number;
}

const byDateDesc = (a: { date: string; code: string }, b: { date: string; code: string }) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : a.code < b.code ? 1 : a.code > b.code ? -1 : 0;

/** Data behind the expandable panel of a ranking row. */
export function classBreakdown(ds: LevelDataset, classCode: string, period: Period): ClassBreakdown {
  const incidents = filterIncidents(ds, { period, classCode });
  const rewards = filterRewards(ds, { period, classCode });
  const counted = countedRewards(rewards, ds.config);
  const countedIds = new Set(counted.map((r) => r.id));
  return {
    incidents,
    issues: topIssues(incidents, Number.POSITIVE_INFINITY),
    counted: [...counted].sort(byDateDesc),
    pending: rewards.filter((r) => !countedIds.has(r.id)).sort(byDateDesc),
    reviewCount: incidents.filter((i) => i.dataCheck === "REVIEW").length,
    unnamedCount: incidents.filter((i) => i.dataCheck === "THIEU_TEN_HS").length,
  };
}

/**
 * Sparkline values: weekly scores up to the end of the selected period (whole series for "Toàn bộ năm học"),
 * keeping the last `max` weeks.
 */
export function trendWindow(series: ReadonlyArray<{ week: string; score: number }>, period: Period, weeks: SchoolWeek[], max = 10): number[] {
  const inPeriod = weeksInPeriod(period, weeks);
  const isAll = period.mode === "all" || !period.key;
  const end = isAll || inPeriod.length === 0 ? undefined : inPeriod[inPeriod.length - 1].weekStart;
  const kept = end ? series.filter((p) => p.week <= end) : series;
  return kept.slice(Math.max(0, kept.length - max)).map((p) => p.score);
}

/** True when the period contains the week in progress (scores may still change). */
export function periodIncludesCurrentWeek(period: Period, weeks: SchoolWeek[], today: string): boolean {
  const monday = mondayOf(today);
  return weeksInPeriod(period, weeks).some((w) => w.weekStart === monday);
}

/** "tuần trước" / "tháng trước" / "học kỳ trước" (empty for the whole year). */
export function previousPeriodNoun(mode: PeriodMode): string {
  return { week: "tuần trước", month: "tháng trước", semester: "học kỳ trước", all: "" }[mode];
}

/**
 * File name of the ranking export, e.g. "NSHM_Xep-hang_THCS_Khoi-6_Thang 10-2026.xlsx" (no path separators).
 * `grade` only for a grade-filtered export of a per-khối ranking (a level-wide ranking is always exported whole).
 */
export function rankingFileName(levelShort: string, periodText: string, grade?: number): string {
  const safePeriod = periodText
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `NSHM_Xep-hang_${levelShort}${typeof grade === "number" ? `_Khoi-${grade}` : ""}_${safePeriod}.xlsx`;
}

/**
 * Link to "Khối & lớp" for a class, keeping the current period (and other global filters) of the page.
 * The grade param is dropped (the class decides the grade; a stale grade would hide the class).
 */
export function classDetailHref(search: string, classCode: string): string {
  const params = new URLSearchParams(search);
  params.delete("grade");
  params.set("class", classCode);
  return `/lop?${params.toString()}`;
}

export type MedalTier = "gold" | "silver" | "bronze" | "none";

export function medalTier(rank: number): MedalTier {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "none";
}
