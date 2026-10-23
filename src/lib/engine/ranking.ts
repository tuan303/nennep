/**
 * Competition score & ranking (BR-RANK-01…06).
 * score = baseScorePerWeek × countedWeeks + counted rewards − penalties (no floor).
 * Ranking group per level (RANKING_RULES): one table per grade (default) or one table for the whole level (THPT);
 * equal scores share a rank, or – THPT – fewer lượt vi phạm ranks higher first (still equal → same rank).
 */
import type { ClassInfo, GradeRanking, Incident, LevelDataset, LevelId, Period, RankingRow, Reward } from "../types";
import { mondayOf } from "./dates";
import { countedRewards, filterIncidents, filterRewards } from "./filters";
import { countedWeeks } from "./period";
import { dataConfidence, ragFor } from "./rag";
import { round2, violationTurnsOf } from "./scoring";
import { naturalCompare } from "./text";
import { groupBy, sortWeeks, sumBy } from "./utils";

export type RankingScope = "grade" | "level";

export interface RankingRule {
  /** "grade": one ranking table per khối (BR-RANK-06); "level": one table for every class of the level. */
  scope: RankingScope;
  /** Equal scores: "none" → same rank; "violationTurns" → fewer lượt vi phạm ranks higher (still equal → same rank). */
  tieBreak: "none" | "violationTurns";
  /** Reports name the first N classes of the group (every class tied at the cut included). */
  topCount?: number;
}

export const DEFAULT_RANKING_RULE: RankingRule = { scope: "grade", tieBreak: "none" };

/** Decision of the school: THPT ranks its classes together (not per khối), fewer lượt vi phạm first, reports name the top 3. */
export const RANKING_RULES: Partial<Record<LevelId, RankingRule>> = {
  THPT: { scope: "level", tieBreak: "violationTurns", topCount: 3 },
};

export function rankingRuleOf(levelId: LevelId): RankingRule {
  return RANKING_RULES[levelId] ?? DEFAULT_RANKING_RULE;
}

/** GradeRanking.grade of a level-wide ranking table. */
export const LEVEL_RANKING_GROUP = 0;

/** "Khối 6" | "Toàn cấp". */
export function rankingGroupLabel(group: number): string {
  return group === LEVEL_RANKING_GROUP ? "Toàn cấp" : `Khối ${group}`;
}

/**
 * Competition ranks aligned with the input order: higher score is better; with `tieKeys` (lower is better) equal
 * scores are ordered by the key; entries equal on both share a rank and the next rank skips (1,2,2,4).
 * Scores compared after round2.
 */
export function competitionRanks(scores: readonly number[], tieKeys?: readonly number[]): number[] {
  const s = scores.map(round2);
  return s.map((own, i) => {
    let better = 0;
    for (let j = 0; j < s.length; j++) {
      if (s[j] > own || (s[j] === own && tieKeys !== undefined && tieKeys[j] < tieKeys[i])) better++;
    }
    return better + 1;
  });
}

/** Lượt vi phạm of a list of incidents. */
function turnsOf(incidents: readonly Incident[]): number {
  let n = 0;
  for (const i of incidents) n += violationTurnsOf(i);
  return n;
}

/** The ranking table (grade or whole level) that holds a class. */
export function findRankingGroup(ranking: { grades: GradeRanking[] }, classCode: string): GradeRanking | undefined {
  return ranking.grades.find((g) => g.rows.some((r) => r.classCode === classCode));
}

export interface NamedTop {
  /** The classes to name (ranking order); [] when no week is counted or every class ties. */
  rows: RankingRow[];
  /** Every class of the table shares the same rank (e.g. all still clean at 100): write "tất cả N lớp đồng hạng". */
  allTied: boolean;
}

/**
 * The top a level names in its reports (RankingRule.topCount, THPT: 3) – topRows incl. classes tied at the cut –
 * shared by every screen so they agree: nothing without a counted week; `allTied` instead of a list when the tie
 * covers the whole table.
 */
export function namedTop(rows: readonly RankingRow[], count: number | undefined): NamedTop {
  if (!count || count <= 0 || !rows.some((r) => r.countedWeeks > 0)) return { rows: [], allTied: false };
  if (rows.length > 1 && rows.every((r) => r.rank === rows[0].rank)) return { rows: [], allTied: true };
  return { rows: topRows(rows, count), allTied: false };
}

/** First `count` rows of a ranking table, every class tied at the cut included ([] when count ≤ 0). */
export function topRows(rows: readonly RankingRow[], count: number): RankingRow[] {
  if (count <= 0 || rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const cut = sorted[Math.min(count, sorted.length) - 1].rank;
  return sorted.filter((r) => r.rank <= cut);
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
  rule: RankingRule;
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
      turns: turnsOf(incidents),
      incidents,
      avgWeeklyPenalty,
      confidence,
      rag,
      reason,
    };
  });
  const ranks = competitionRanks(
    partial.map((p) => p.score),
    ctx.rule.tieBreak === "violationTurns" ? partial.map((p) => p.turns) : undefined,
  );
  const cutoff = top90Cutoff(classes.length, config.top90Ratio);
  const rows: RankingRow[] = partial.map((p, idx) => {
    const row: RankingRow = {
      classCode: p.c.code,
      grade: p.c.grade,
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
      violationTurns: p.turns,
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
 * Ranking tables. Population = ALL active classes of each grade (BR-RANK-06) – or, for a level ranked as a whole
 * (RankingRule.scope "level", THPT), one table of every active class with grade = LEVEL_RANKING_GROUP.
 * `opts.grade` only limits which grade tables are returned (ignored for a level-wide ranking: the class of any grade is
 * in the single table); `opts.highlightClass` only sets `highlighted`.
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
    rule: rankingRuleOf(ds.levelId),
  };
  const active = ds.classes.filter((c) => c.active);
  if (ctx.rule.scope === "level") {
    return { countedWeeks: cw, grades: active.length ? [gradeRanking(LEVEL_RANKING_GROUP, active, ctx)] : [] };
  }
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
 * class's ranking group (active classes of its grade, or of the level – RankingRule) for that week, with the level's
 * tie-break. [] when the class is unknown.
 */
export function classScoreSeries(
  ds: LevelDataset,
  classCode: string,
  today: string,
): Array<{ week: string; score: number; penalty: number; reward: number; rank: number }> {
  const cls = ds.classes.find((c) => c.code === classCode);
  if (!cls) return [];
  const rule = rankingRuleOf(ds.levelId);
  const population = ds.classes.filter((c) => c.active && (rule.scope === "level" || c.grade === cls.grade)).map((c) => c.code);
  if (!population.includes(classCode)) population.push(classCode);
  const members = new Set(population);

  const key = (week: string, code: string) => `${week}|${code}`;
  const penalty = new Map<string, number>();
  const turns = new Map<string, number>();
  for (const i of ds.incidents) {
    if (i.deletedAt || !members.has(i.classCode)) continue;
    penalty.set(key(i.week, i.classCode), (penalty.get(key(i.week, i.classCode)) ?? 0) + i.points);
    turns.set(key(i.week, i.classCode), (turns.get(key(i.week, i.classCode)) ?? 0) + violationTurnsOf(i));
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
      const turnsOfClass = (code: string) => turns.get(key(w.weekStart, code)) ?? 0;
      const ownTurns = turnsOfClass(classCode);
      const better = population.filter((code) => {
        if (code === classCode) return false;
        const other = scoreOf(code);
        return other > own || (other === own && rule.tieBreak === "violationTurns" && turnsOfClass(code) < ownTurns);
      }).length;
      return {
        week: w.weekStart,
        score: own,
        penalty: round2(penalty.get(key(w.weekStart, classCode)) ?? 0),
        reward: round2(reward.get(key(w.weekStart, classCode)) ?? 0),
        rank: better + 1,
      };
    });
}
