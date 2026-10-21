/**
 * Competition score & ranking per grade (BR-RANK-01…06).
 * score = baseScorePerWeek × countedWeeks + counted rewards − penalties (no floor).
 */
import type { ClassInfo, GradeRanking, Incident, LevelDataset, Period, RankingRow, Reward } from "../types";
import { mondayOf } from "./dates";
import { countedRewards, filterIncidents, filterRewards } from "./filters";
import { countedWeeks } from "./period";
import { dataConfidence, ragFor } from "./rag";
import { round2 } from "./scoring";
import { naturalCompare } from "./text";
import { groupBy, sortWeeks, sumBy } from "./utils";

/** Competition ranks aligned with the input order: higher is better, ties share a rank, next rank skips (1,2,2,4). Scores compared after round2. */
export function competitionRanks(scores: number[]): number[] {
  const rounded = scores.map(round2);
  const sorted = [...rounded].sort((a, b) => b - a);
  const firstIndex = new Map<number, number>();
  sorted.forEach((s, i) => {
    if (!firstIndex.has(s)) firstIndex.set(s, i);
  });
  return rounded.map((s) => (firstIndex.get(s) ?? 0) + 1);
}

/** BR-RANK-05: ceil(ratio × classCount), robust to floating point (0.9 × 70 → 63). */
export function top90Cutoff(classCount: number, ratio: number): number {
  if (classCount <= 0) return 0;
  return Math.max(0, Math.ceil(ratio * classCount - 1e-9));
}

interface RowContext {
  ds: LevelDataset;
  countedWeeks: number;
  base: number;
  incidentsByClass: Map<string, Incident[]>;
  rewardsByClass: Map<string, Reward[]>;
  highlightClass?: string;
}

function gradeRanking(grade: number, classes: ClassInfo[], ctx: RowContext): GradeRanking {
  const { config } = ctx.ds;
  const partial = classes.map((c) => {
    const incidents = ctx.incidentsByClass.get(c.code) ?? [];
    const rewards = ctx.rewardsByClass.get(c.code) ?? [];
    const rewardPoints = sumBy(rewards, (r) => r.points);
    const penaltyPoints = sumBy(incidents, (i) => i.points);
    const avgWeeklyPenalty = round2(penaltyPoints / Math.max(1, ctx.countedWeeks));
    const confidence = dataConfidence(incidents);
    const { rag, reason } = ragFor({ avgWeeklyPenalty, confidence, config });
    return {
      c,
      score: round2(ctx.base + rewardPoints - penaltyPoints),
      rewardPoints,
      penaltyPoints,
      incidents,
      avgWeeklyPenalty,
      confidence,
      rag,
      reason,
    };
  });
  const ranks = competitionRanks(partial.map((p) => p.score));
  const cutoff = top90Cutoff(classes.length, config.top90Ratio);
  const rows: RankingRow[] = partial.map((p, idx) => {
    const row: RankingRow = {
      classCode: p.c.code,
      grade,
      countedWeeks: ctx.countedWeeks,
      base: ctx.base,
      rewardPoints: p.rewardPoints,
      penaltyPoints: p.penaltyPoints,
      score: p.score,
      rank: ranks[idx],
      gradeClassCount: classes.length,
      top90Cutoff: cutoff,
      inTop90: ranks[idx] <= cutoff,
      incidentCount: p.incidents.length,
      relatedStudentCount: sumBy(p.incidents, (i) => i.relatedStudentCount),
      avgWeeklyPenalty: p.avgWeeklyPenalty,
      confidence: p.confidence,
      rag: p.rag,
      ragReason: p.reason,
      highlighted: ctx.highlightClass !== undefined && ctx.highlightClass === p.c.code,
    };
    if (p.c.homeroomTeacher) row.homeroomTeacher = p.c.homeroomTeacher;
    return row;
  });
  rows.sort((a, b) => a.rank - b.rank || naturalCompare(a.classCode, b.classCode));
  return { grade, rows };
}

/**
 * Ranking tables per grade. Population = ALL active classes of each grade (BR-RANK-06):
 * `opts.grade` only limits which grade tables are returned; `opts.highlightClass` only sets `highlighted`.
 */
export function buildRanking(
  ds: LevelDataset,
  period: Period,
  today: string,
  opts: { highlightClass?: string; grade?: number } = {},
): { countedWeeks: number; grades: GradeRanking[] } {
  const cw = countedWeeks(period, ds.weeks, today);
  const ctx: RowContext = {
    ds,
    countedWeeks: cw,
    base: round2(ds.config.baseScorePerWeek * cw),
    incidentsByClass: groupBy(filterIncidents(ds, { period }), (i) => i.classCode),
    rewardsByClass: groupBy(countedRewards(filterRewards(ds, { period }), ds.config), (r) => r.classCode),
    highlightClass: opts.highlightClass,
  };
  const active = ds.classes.filter((c) => c.active);
  const byGrade = groupBy(active, (c) => String(c.grade));
  const grades = [...new Set(active.map((c) => c.grade))]
    .sort((a, b) => a - b)
    .filter((g) => typeof opts.grade !== "number" || g === opts.grade);
  return { countedWeeks: cw, grades: grades.map((g) => gradeRanking(g, byGrade.get(String(g)) ?? [], ctx)) };
}

/** Convenience: the row of a class inside a ranking result (undefined when the class is not ranked). */
export function findRankingRow(ranking: { grades: GradeRanking[] }, classCode: string): RankingRow | undefined {
  for (const g of ranking.grades) {
    const row = g.rows.find((r) => r.classCode === classCode);
    if (row) return row;
  }
  return undefined;
}

/**
 * Weekly score series of a class over elapsed COUNTED weeks (weekStart ≤ Monday(today)), ascending.
 * score = base of one week + counted rewards − penalties of that week; rank = competition rank inside the
 * class's grade (population = active classes of the grade) for that week. [] when the class is unknown.
 */
export function classScoreSeries(
  ds: LevelDataset,
  classCode: string,
  today: string,
): Array<{ week: string; score: number; penalty: number; reward: number; rank: number }> {
  const cls = ds.classes.find((c) => c.code === classCode);
  if (!cls) return [];
  const population = ds.classes.filter((c) => c.active && c.grade === cls.grade).map((c) => c.code);
  if (!population.includes(classCode)) population.push(classCode);
  const members = new Set(population);

  const key = (week: string, code: string) => `${week}|${code}`;
  const penalty = new Map<string, number>();
  for (const i of ds.incidents) {
    if (i.deletedAt || !members.has(i.classCode)) continue;
    penalty.set(key(i.week, i.classCode), (penalty.get(key(i.week, i.classCode)) ?? 0) + i.points);
  }
  const reward = new Map<string, number>();
  for (const r of countedRewards(ds.rewards, ds.config)) {
    if (r.deletedAt || !members.has(r.classCode)) continue;
    reward.set(key(r.week, r.classCode), (reward.get(key(r.week, r.classCode)) ?? 0) + r.points);
  }

  const currentMonday = mondayOf(today);
  const base = ds.config.baseScorePerWeek;
  return sortWeeks(ds.weeks)
    .filter((w) => w.counted && w.weekStart <= currentMonday)
    .map((w) => {
      const scoreOf = (code: string) =>
        round2(base + (reward.get(key(w.weekStart, code)) ?? 0) - (penalty.get(key(w.weekStart, code)) ?? 0));
      const own = scoreOf(classCode);
      const better = population.filter((code) => code !== classCode && scoreOf(code) > own).length;
      return {
        week: w.weekStart,
        score: own,
        penalty: round2(penalty.get(key(w.weekStart, classCode)) ?? 0),
        reward: round2(reward.get(key(w.weekStart, classCode)) ?? 0),
        rank: better + 1,
      };
    });
}
