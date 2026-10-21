/**
 * Small, pure display helpers shared by the dashboard screens (chart data shaping, labels, links, ratios).
 */
import { CHART_OTHER_COLOR, chartColor } from "@/components/charts/theme";
import { round2 } from "@/lib/engine/scoring";
import type { Unit } from "@/lib/types";

const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Short weekday labels (T2…CN); Sunday (and Saturday when both are empty) are dropped when they have no incident. */
export function weekdayBars(dist: ReadonlyArray<{ weekday: string; incidents: number }>): { labels: string[]; values: number[]; full: string[] } {
  let keep = dist.length;
  if (keep === 7 && dist[6].incidents === 0) {
    keep = 6;
    if (dist[5].incidents === 0) keep = 5;
  }
  const rows = dist.slice(0, keep);
  return { labels: rows.map((_, i) => WEEKDAY_SHORT[i] ?? ""), values: rows.map((d) => d.incidents), full: rows.map((d) => d.weekday) };
}

/** Name of the folded tail slice. */
export const OTHER_SLICE = "Khác";

/** "#rrggbb" mixed with white (`amount` 0–1); other colour formats are returned unchanged. */
export function fadeColor(hex: string, amount = 0.65): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * Math.max(0, Math.min(1, amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Donut slices of the category breakdown: colour by catalog order (stable across filters), ≤ 8 slices (tail → "Khác").
 * With a `selected` Mảng (cross-filter), the other slices are faded so the selection stands out among them.
 */
export function categorySlices(
  breakdown: ReadonlyArray<{ category: string; incidents: number; points: number }>,
  categoryOrder: readonly string[],
  metric: "incidents" | "points",
  selected?: string,
): Array<{ name: string; value: number; color: string }> {
  const slices = foldSlices(breakdown, categoryOrder, metric);
  if (!selected || !slices.some((s) => s.name === selected)) return slices;
  return slices.map((s) => (s.name === selected ? s : { ...s, color: fadeColor(s.color) }));
}

function foldSlices(
  breakdown: ReadonlyArray<{ category: string; incidents: number; points: number }>,
  categoryOrder: readonly string[],
  metric: "incidents" | "points",
): Array<{ name: string; value: number; color: string }> {
  const rows = breakdown
    .map((b) => ({ name: b.category, value: metric === "incidents" ? b.incidents : b.points }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const colorOf = (name: string) => {
    const idx = categoryOrder.indexOf(name);
    return idx >= 0 ? chartColor(idx) : CHART_OTHER_COLOR;
  };
  if (rows.length <= 8) return rows.map((r) => ({ ...r, color: colorOf(r.name) }));
  const head = rows.slice(0, 7).map((r) => ({ ...r, color: colorOf(r.name) }));
  const rest = round2(rows.slice(7).reduce((a, r) => a + r.value, 0));
  return [...head, { name: OTHER_SLICE, value: rest, color: CHART_OTHER_COLOR }];
}

/** "Tính theo HS" / "Tính theo lần". */
export function unitLabel(unit: Unit): string {
  return unit === "/HS" ? "Tính theo HS" : "Tính theo lần";
}

/**
 * `path` + the current query string with some params replaced (undefined removes one) – used to keep the global
 * filters when drilling down (e.g. `/lop?mode=week&key=…&class=6A03`).
 */
export function hrefWithParams(path: string, search: string, patch: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams(search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Ratio helper for bars (0 when max is 0). */
export function share(value: number, max: number): number {
  return max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
}
