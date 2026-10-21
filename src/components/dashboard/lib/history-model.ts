/**
 * Pure view models of the REQ_V2 Tổng quan cards "Theo nhóm lỗi" (bars per error group) and "Điểm trừ cộng dồn"
 * (cumulative penalty lines). Numbers come from the engine (groupBreakdown, cumulativePenalty); these helpers only pick
 * series, colours and labels. Unit-tested in __tests__/history-model.test.ts.
 */
import { CHART_OTHER_COLOR, chartColor } from "@/components/charts/theme";
import { toneHex } from "@/components/ui/tones";
import { NO_GROUP_LABEL, type CumulativePenalty, type CumulativeSeries, type GroupStat } from "@/lib/engine/analytics";
import type { CatalogItem, GlobalFilters, Period, SchoolWeek } from "@/lib/types";
import { periodWeekSet } from "./overview-model";
import { fadeColor } from "./view-helpers";

/* ------------------------------ Theo nhóm lỗi ------------------------------ */

export type GroupMetric = "incidents" | "violationTurns" | "points";

export const GROUP_METRICS: ReadonlyArray<{ value: GroupMetric; label: string }> = [
  { value: "incidents", label: "Sự việc" },
  { value: "violationTurns", label: "Lượt vi phạm" },
  { value: "points", label: "Điểm trừ" },
];

/** Group to emphasise: the group filter, else the group of the filtered error (catalog). */
export function selectedGroup(
  filters: Pick<GlobalFilters, "group" | "errorCode">,
  catalog: readonly Pick<CatalogItem, "code" | "group">[],
): string | undefined {
  if (filters.group) return filters.group;
  if (!filters.errorCode) return undefined;
  return catalog.find((c) => c.code === filters.errorCode)?.group?.trim() || undefined;
}

export interface GroupBarsView {
  categories: string[];
  values: number[];
  /** Per bar: stable colour (catalog order), faded when another group is selected. */
  colors: string[];
  /** Per bar: can be used as a filter (the "Chưa phân nhóm" bucket cannot – the engine matches `group` exactly). */
  clickable: boolean[];
  total: number;
  selected?: string;
}

/**
 * Bars of the "Theo nhóm lỗi" card from `groupBreakdown(scope without group/error, catalog)`. Colours follow the
 * breakdown order (stable because the catalog groups are always listed); NO_GROUP_LABEL is grey.
 */
export function groupBars(stats: readonly GroupStat[], metric: GroupMetric, selected?: string): GroupBarsView {
  const hasSelection = !!selected && stats.some((s) => s.group === selected);
  let slot = 0;
  const colors = stats.map((s) => {
    const base = s.group === NO_GROUP_LABEL ? CHART_OTHER_COLOR : chartColor(slot++);
    return hasSelection && s.group !== selected ? fadeColor(base) : base;
  });
  const values = stats.map((s) => s[metric]);
  return {
    categories: stats.map((s) => s.group),
    values,
    colors,
    clickable: stats.map((s) => s.group !== NO_GROUP_LABEL),
    total: values.reduce((a, v) => a + v, 0),
    selected: hasSelection ? selected : undefined,
  };
}

/**
 * Filter value after clicking a bar: the same group again clears it; the "Chưa phân nhóm" bucket is not a filter
 * (returns `null` = no change).
 */
export function groupClickFilter(clicked: string, current: string | undefined): string | undefined | null {
  if (clicked === NO_GROUP_LABEL) return null;
  return clicked === current ? undefined : clicked;
}

/* ---------------------------- Điểm trừ cộng dồn ---------------------------- */

export type CumulativeMode = "total" | "grade" | "class";

export const CUMULATIVE_MODES: ReadonlyArray<{ value: CumulativeMode; label: string }> = [
  { value: "total", label: "Toàn cấp" },
  { value: "grade", label: "Theo khối" },
  { value: "class", label: "Theo lớp" },
];

export interface CumulativeLine {
  key: string;
  name: string;
  data: number[];
  color: string;
  dashed?: boolean;
  area?: boolean;
}

const lastOf = (s: CumulativeSeries) => (s.values.length ? s.values[s.values.length - 1] : 0);

/**
 * Lines of the cumulative chart.
 * - total: the single engine series (crimson area).
 * - grade: one line per grade (palette by grade order).
 * - class: the `top` classes by final value (desc, then engine order) + the filtered class (crimson, appended when it
 *   is not among them); grade-average series (`avg:N`) are kept as dashed grey lines.
 */
export function cumulativeLines(cp: CumulativePenalty, mode: CumulativeMode, opts: { classCode?: string; top?: number } = {}): CumulativeLine[] {
  const top = opts.top ?? 5;
  const avg = cp.series.filter((s) => s.key.startsWith("avg:"));
  const main = cp.series.filter((s) => !s.key.startsWith("avg:"));
  const avgLines = avg.map((s) => ({ key: s.key, name: s.label, data: s.values, color: "#94a3b8", dashed: true }));
  if (mode === "total") {
    return [...main.map((s) => ({ key: s.key, name: s.label, data: s.values, color: toneHex.bad, area: true })), ...avgLines];
  }
  if (mode === "grade") {
    return [...main.map((s, i) => ({ key: s.key, name: s.label, data: s.values, color: chartColor(i) })), ...avgLines];
  }
  const ranked = main
    .map((s, i) => ({ s, i }))
    .sort((a, b) => lastOf(b.s) - lastOf(a.s) || a.i - b.i)
    .map((x) => x.s);
  const highlightKey = opts.classCode ? `class:${opts.classCode}` : undefined;
  const picked = ranked.filter((s) => lastOf(s) > 0).slice(0, top);
  const extra = highlightKey ? main.find((s) => s.key === highlightKey) : undefined;
  if (extra && !picked.includes(extra)) picked.push(extra);
  let slot = 0;
  const lines = picked.map((s) => ({
    key: s.key,
    name: s.label,
    data: s.values,
    color: s.key === highlightKey ? toneHex.brand : chartColor(slot++),
  }));
  return [...lines, ...avgLines];
}

/** Per cumulative week: inside the selected period (all false for "Toàn bộ năm học"). */
export function weekHighlight(weeks: readonly string[], period: Period, calendar: SchoolWeek[]): boolean[] {
  const set = periodWeekSet(period, calendar);
  return weeks.map((w) => set.has(w));
}

/** Last value of a line (0 when empty). */
export function finalValue(line: Pick<CumulativeLine, "data">): number {
  return line.data.length ? line.data[line.data.length - 1] : 0;
}
