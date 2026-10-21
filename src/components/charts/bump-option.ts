/**
 * Pure ECharts option builder of the bump chart (rank movement): inverted y axis 1…N (1 on top), one line per entity.
 * Emphasised lines (e.g. the top 5 and the filtered class) get palette colours and an end label; the other lines are
 * drawn faded and can be hidden through the legend selection. Unit-tested in bump-option.test.ts.
 */
import type { LineSeriesOption } from "echarts/charts";
import { formatNumberVN } from "../ui/format";
import { escapeHtml, type ValueFormatter } from "./options";
import { CHART_TOKENS, chartColor, type ChartOption } from "./theme";

/** "highlight" = the selected entity (crimson, thicker); "top" = palette colour; "faded" = muted background line. */
export type BumpEmphasis = "highlight" | "top" | "faded";

export interface BumpLine {
  /** Series name, e.g. "6A01" (unique). */
  name: string;
  /** Rank per category (1 = best); null = no rank that week. */
  ranks: ReadonlyArray<number | null>;
  /** Optional score per category (shown in the tooltip). */
  scores?: ReadonlyArray<number | null>;
  emphasis: BumpEmphasis;
  /** Fixed colour (default: palette slot by emphasised order; crimson for "highlight"). */
  color?: string;
}

export interface BumpOptionInput {
  /** Category labels ("dd/mm"). */
  categories: string[];
  lines: BumpLine[];
  /** Population size N (y axis 1…N). Default: the largest rank. */
  total?: number;
  /** Show the faded lines (legend selection). Default true. */
  showFaded?: boolean;
  /** Tooltip header of a category (default "Tuần <label>"). */
  headerOf?: (index: number) => string;
  scoreFormatter?: ValueFormatter;
  /** Slider along x (default when > 26 categories). */
  zoom?: boolean;
}

export const BUMP_HIGHLIGHT_COLOR = CHART_TOKENS.brand;
export const BUMP_FADED_COLOR = "#cbd5e1";

/** Largest rank of the lines (≥ 1). */
export function bumpTotal(lines: ReadonlyArray<Pick<BumpLine, "ranks">>): number {
  let max = 1;
  for (const l of lines) for (const r of l.ranks) if (typeof r === "number" && Number.isFinite(r) && r > max) max = r;
  return max;
}

/** Colour of every line: "highlight" → crimson, "top" → palette slots in order, "faded" → muted grey. */
export function bumpColors(lines: ReadonlyArray<Pick<BumpLine, "emphasis" | "color">>): string[] {
  let slot = 0;
  return lines.map((l) => {
    if (l.color) return l.color;
    if (l.emphasis === "highlight") return BUMP_HIGHLIGHT_COLOR;
    if (l.emphasis === "faded") return BUMP_FADED_COLOR;
    return chartColor(slot++);
  });
}

/** Tooltip text of one point: "Tuần 12/10: hạng 2/8 · điểm 385". */
export function bumpPointText(args: { header: string; rank: number | null; total: number; score?: number | null; scoreFormatter?: ValueFormatter }): string {
  const fmt = args.scoreFormatter ?? formatNumberVN;
  const rank = args.rank === null || args.rank === undefined ? "chưa xếp hạng" : `hạng ${args.rank}/${args.total}`;
  const score = typeof args.score === "number" ? ` · điểm ${fmt(args.score)}` : "";
  return `${args.header}: ${rank}${score}`;
}

interface TooltipParam {
  seriesName?: string;
  dataIndex?: number;
  color?: unknown;
}

export function buildBumpOption({ categories, lines, total, showFaded = true, headerOf, scoreFormatter, zoom }: BumpOptionInput): ChartOption {
  const n = Math.max(1, total ?? bumpTotal(lines));
  const colors = bumpColors(lines);
  const useZoom = zoom ?? categories.length > 26;
  const showSymbol = categories.length <= 20;
  const header = (i: number) => (headerOf ? headerOf(i) : `Tuần ${categories[i] ?? ""}`);
  const byName = new Map(lines.map((l) => [l.name, l] as const));

  // Faded lines first so emphasised ones are drawn on top.
  const order = lines.map((l, i) => i).sort((a, b) => Number(lines[b].emphasis === "faded") - Number(lines[a].emphasis === "faded"));
  const series: LineSeriesOption[] = order.map((i) => {
    const l = lines[i];
    const color = colors[i];
    const faded = l.emphasis === "faded";
    const strong = l.emphasis === "highlight";
    return {
      type: "line",
      name: l.name,
      data: l.ranks.map((r) => (typeof r === "number" && Number.isFinite(r) ? r : null)),
      smooth: false,
      connectNulls: false,
      symbol: "circle",
      showSymbol: faded ? false : showSymbol,
      symbolSize: strong ? 9 : 7,
      z: faded ? 1 : strong ? 4 : 3,
      lineStyle: { width: strong ? 3.5 : faded ? 1.5 : 2.25, color, opacity: faded ? 0.75 : 1 },
      itemStyle: { color, borderColor: CHART_TOKENS.surface, borderWidth: 2 },
      emphasis: { focus: "series", lineStyle: { width: strong ? 4 : 3 } },
      endLabel: faded
        ? { show: false }
        : {
            show: true,
            formatter: "{a}",
            color,
            fontWeight: strong ? 700 : 600,
            fontSize: 11.5,
            distance: 6,
          },
    };
  });

  const selected: Record<string, boolean> = {};
  for (const l of lines) selected[l.name] = l.emphasis !== "faded" || showFaded;

  return {
    legend: {
      show: lines.length > 1,
      type: "scroll",
      top: 0,
      left: 0,
      icon: "path://M0,0 L16,0 L16,3 L0,3 Z",
      itemWidth: 16,
      itemHeight: 3,
      data: lines.map((l) => l.name),
      selected,
    },
    grid: { left: 4, right: 52, top: lines.length > 1 ? 40 : 14, bottom: useZoom ? 44 : 4, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (raw: unknown) => {
        const p = raw as TooltipParam;
        const line = p.seriesName ? byName.get(p.seriesName) : undefined;
        const idx = typeof p.dataIndex === "number" ? p.dataIndex : 0;
        const text = bumpPointText({
          header: header(idx),
          rank: line?.ranks[idx] ?? null,
          total: n,
          score: line?.scores?.[idx],
          scoreFormatter,
        });
        return `<div style="display:flex;align-items:center;gap:6px;font-weight:600"><span style="width:8px;height:8px;border-radius:999px;background:${escapeHtml(
          String(p.color ?? ""),
        )}"></span>${escapeHtml(p.seriesName ? `Lớp ${p.seriesName}` : "")}</div><div style="margin-top:2px">${escapeHtml(text)}</div>`;
      },
    },
    xAxis: { type: "category", data: categories, boundaryGap: false, axisLabel: { hideOverlap: true } },
    yAxis: {
      type: "value",
      inverse: true,
      min: 1,
      max: n,
      interval: n <= 12 ? 1 : undefined,
      minInterval: 1,
      axisLabel: { formatter: (v: number) => (Number.isInteger(v) ? `#${v}` : "") },
    },
    dataZoom: useZoom
      ? [
          { type: "slider", xAxisIndex: 0, height: 18, bottom: 6, startValue: Math.max(0, categories.length - 20), brushSelect: false },
          { type: "inside", xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
        ]
      : undefined,
    series,
  };
}
