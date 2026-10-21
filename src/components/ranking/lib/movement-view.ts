/**
 * Pure view models of the Xếp hạng views (REQ_V2 §6.3): view switching (`?view=bang|bien-dong|bao-phu`) and the
 * "Biến động xếp hạng" bump chart lines. Ranks / scores come from the engine (`rankHistory`). Unit-tested.
 */
import type { BumpLine } from "@/components/charts/bump-option";
import type { RankHistory } from "@/lib/engine";

export type RankingView = "bang" | "bien-dong" | "bao-phu";

export const RANKING_VIEW_PARAM = "view";

export const RANKING_VIEWS: ReadonlyArray<{ value: RankingView; label: string; short: string }> = [
  { value: "bang", label: "Bảng xếp hạng", short: "Bảng" },
  { value: "bien-dong", label: "Biến động xếp hạng", short: "Biến động" },
  { value: "bao-phu", label: "Bao phủ kiểm tra", short: "Bao phủ" },
];

/** Unknown / missing → "bang" (default view). */
export function parseRankingView(raw: string | null | undefined): RankingView {
  const v = raw?.trim();
  return v === "bien-dong" || v === "bao-phu" ? v : "bang";
}

/** URL of a view, keeping every other param (global filters); the default view drops the param. */
export function rankingViewHref(pathname: string, search: string, view: RankingView): string {
  const p = new URLSearchParams(search);
  if (view === "bang") p.delete(RANKING_VIEW_PARAM);
  else p.set(RANKING_VIEW_PARAM, view);
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export type RankBasis = "cumulative" | "week";

export const RANK_BASIS_OPTIONS: ReadonlyArray<{ value: RankBasis; label: string }> = [
  { value: "cumulative", label: "Cộng dồn" },
  { value: "week", label: "Từng tuần" },
];

const lastRank = (ranks: readonly number[]) => (ranks.length ? ranks[ranks.length - 1] : Number.POSITIVE_INFINITY);

/**
 * Bump chart lines of one grade: the `top` classes by latest rank (ties: class display order) are coloured, the
 * filtered class is highlighted (crimson, also when outside the top), every other class is faded.
 */
export function bumpLines(history: RankHistory, opts: { highlight?: string; top?: number } = {}): BumpLine[] {
  const top = opts.top ?? 5;
  const order = history.classes
    .map((c, i) => ({ code: c.classCode, last: lastRank(c.ranks), i }))
    .sort((a, b) => a.last - b.last || a.i - b.i)
    .slice(0, top)
    .map((x) => x.code);
  const topSet = new Set(order);
  return history.classes.map((c) => ({
    name: c.classCode,
    ranks: c.ranks,
    scores: c.scores,
    emphasis: c.classCode === opts.highlight ? "highlight" : topSet.has(c.classCode) ? "top" : "faded",
  }));
}

export interface RankMove {
  classCode: string;
  first: number;
  last: number;
  /** first − last: positive = moved up. */
  change: number;
}

/** Movement between the first and the last point of the chart, biggest risers first (ties: class order). */
export function rankMoves(history: RankHistory): RankMove[] {
  return history.classes
    .filter((c) => c.ranks.length > 0)
    .map((c, i) => ({ classCode: c.classCode, first: c.ranks[0], last: c.ranks[c.ranks.length - 1], change: c.ranks[0] - c.ranks[c.ranks.length - 1], i }))
    .sort((a, b) => b.change - a.change || a.i - b.i)
    .map(({ classCode, first, last, change }) => ({ classCode, first, last, change }));
}

/** Biggest riser and faller (undefined when nobody moved in that direction). */
export function topMovers(history: RankHistory): { up?: RankMove; down?: RankMove } {
  const moves = rankMoves(history);
  const up = moves.find((m) => m.change > 0);
  const downs = moves.filter((m) => m.change < 0);
  const down = downs.length ? downs.reduce((a, b) => (b.change < a.change ? b : a)) : undefined;
  return { up, down };
}

/** "Tuần 12/10" tooltip header of the cumulative / weekly basis. */
export function bumpHeader(basis: RankBasis, label: string): string {
  return basis === "cumulative" ? `Đến tuần ${label}` : `Tuần ${label}`;
}
