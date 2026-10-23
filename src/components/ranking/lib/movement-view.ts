/**
 * Pure view models of the Xếp hạng views (REQ_V2 §6.3): view switching (`?view=bang|bien-dong|bao-phu`) and the
 * "Biến động xếp hạng" bump chart lines. Ranks / scores come from the engine (`rankHistory`). Unit-tested.
 */
import type { BumpLine } from "@/components/charts/bump-option";
import type { RankHistory, RankingScope } from "@/lib/engine";

export type RankingView = "bang" | "bien-dong" | "bao-phu";

export const RANKING_VIEW_PARAM = "view";

export const RANKING_VIEWS: ReadonlyArray<{ value: RankingView; label: string; short: string }> = [
  { value: "bang", label: "Bảng xếp hạng", short: "Bảng" },
  { value: "bien-dong", label: "Biến động xếp hạng", short: "Biến động" },
  { value: "bao-phu", label: "Bao phủ kiểm tra", short: "Bao phủ" },
];

/** Page description of a view; a level ranked as a whole (THPT) reads "toàn cấp" instead of "khối". */
export function rankingViewDescription(view: RankingView, scope: RankingScope): string {
  const level = scope === "level";
  switch (view) {
    case "bang":
      return `Bảng xếp hạng ${level ? "toàn cấp" : "theo khối"}: điểm nền, điểm thưởng, điểm trừ, nhóm Top và mức cảnh báo của từng lớp.`;
    case "bien-dong":
      return `Thứ hạng của từng lớp ${level ? "toàn cấp" : "trong khối"} qua các tuần tính thi đua: lớp nào đang lên, lớp nào đang xuống.`;
    case "bao-phu":
      return "Số đợt, số buổi kiểm tra nền nếp của từng lớp so với trung bình khối – để so sánh điểm trừ được công bằng.";
  }
}

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

/** Legend sentence under the basis hint: filtered class, coloured leaders, and whether the other lines are shown. */
export function movementLegendText(opts: { highlight?: string; showOthers: boolean; top?: number }): string {
  const top = opts.top ?? 5;
  const own = opts.highlight ? `Đường đỏ đậm là lớp ${opts.highlight} đang lọc; ` : "";
  const others = opts.showOthers
    ? "các lớp khác được làm mờ (bấm tên lớp ở chú thích để ẩn/hiện)."
    : "các lớp khác đang ẩn (bật “Hiện các lớp khác” hoặc bấm tên lớp ở chú thích để hiện).";
  return `${own}${top} lớp dẫn đầu có màu riêng, ${others}`;
}

/** "Tuần 12/10" tooltip header of the cumulative / weekly basis. */
export function bumpHeader(basis: RankBasis, label: string): string {
  return basis === "cumulative" ? `Đến tuần ${label}` : `Tuần ${label}`;
}
