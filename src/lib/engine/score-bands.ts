/**
 * Nhóm điểm thi đua của Báo cáo tuần/tháng (THCS): Dẫn đầu · Top >90% · Top 51%–90% · Top <51%.
 * The share is the score against the base of the period (điểm nền = điểm cơ sở × số tuần tính thi đua), so a week
 * reads in points (91 điểm = 91%) and a month of 4 weeks in points / 400. "Dẫn đầu" = rank 1 of the grade (every class
 * tied at the highest score); the other classes go by share: > above → Top >90%, ≥ from → Top 51%–90%, else Top <51%.
 */
import type { LevelId, RankingRow } from "../types";

export type ScoreBand = "LEADER" | "HIGH" | "MIDDLE" | "LOW";

export interface ScoreBandRule {
  /** Top >{above}%: share strictly above. */
  above: number;
  /** Top {from}%–{above}%: share from `from` up to `above` (inclusive). Below → Top <{from}%. */
  from: number;
}

/** Levels whose reports group classes by score band (decided by the school: THCS). */
export const SCORE_BAND_RULES: Partial<Record<LevelId, ScoreBandRule>> = {
  THCS: { above: 90, from: 51 },
};

export const SCORE_BAND_ORDER: readonly ScoreBand[] = ["LEADER", "HIGH", "MIDDLE", "LOW"];

export function scoreBandLabel(band: ScoreBand, rule: ScoreBandRule): string {
  if (band === "LEADER") return "Dẫn đầu";
  if (band === "HIGH") return `Top >${rule.above}%`;
  if (band === "MIDDLE") return `Top ${rule.from}%–${rule.above}%`;
  return `Top <${rule.from}%`;
}

/** Score as a percentage of the base of the period (2 decimals); undefined when nothing is counted (base 0). */
export function scoreShare(row: Pick<RankingRow, "score" | "base">): number | undefined {
  if (!(row.base > 0)) return undefined;
  return Math.round((row.score / row.base) * 10000) / 100;
}

/** Band of one ranked class; undefined when the period counts no week. */
export function scoreBandOf(row: Pick<RankingRow, "rank" | "score" | "base">, rule: ScoreBandRule): ScoreBand | undefined {
  if (!(row.base > 0)) return undefined;
  if (row.rank === 1) return "LEADER";
  // Share in % rounded to 6 decimals: exact for real scores (2 decimals), immune to float noise (5.1 / 10 = 51%).
  const pct = Math.round((row.score / row.base) * 1e8) / 1e6;
  if (pct > rule.above) return "HIGH";
  if (pct >= rule.from) return "MIDDLE";
  return "LOW";
}

/** Classes of one grade ranking per band (each list keeps the ranking order). */
export function groupByScoreBand(rows: readonly RankingRow[], rule: ScoreBandRule): Record<ScoreBand, RankingRow[]> {
  const out: Record<ScoreBand, RankingRow[]> = { LEADER: [], HIGH: [], MIDDLE: [], LOW: [] };
  for (const r of rows) {
    const band = scoreBandOf(r, rule);
    if (band) out[band].push(r);
  }
  return out;
}
