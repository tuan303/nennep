import type { ComposeOption } from "echarts/core";
import type { BarSeriesOption, HeatmapSeriesOption, LineSeriesOption, PieSeriesOption } from "echarts/charts";
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  MarkLineComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from "echarts/components";

/** Option type accepted by <EChart> (only the registered chart types / components). */
export type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | HeatmapSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | VisualMapComponentOption
  | DataZoomComponentOption
  | MarkLineComponentOption
>;

/**
 * Categorical palette – FIXED order, never cycled. Validated (dataviz validate_palette.js, light surface):
 * lightness band, chroma floor, adjacent CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 15.
 * NSHM navy · star gold · aqua · violet · orange · sky · pink · green
 */
export const CHART_COLORS = ["#2b3a9e", "#eda100", "#1baf7a", "#4a3aa7", "#eb6834", "#0ea5e9", "#e87ba4", "#008300"] as const;

/** Colour for the "Khác" (other) bucket and for series beyond the 8th – fold them instead of inventing hues. */
export const CHART_OTHER_COLOR = "#94a3b8";

/** Series colour by stable index (assign by entity, not by rank, so filters never repaint survivors). */
export function chartColor(index: number): string {
  return CHART_COLORS[index] ?? CHART_OTHER_COLOR;
}

/** Sequential single-hue ramps (light → dark) for heatmaps. */
export const HEAT_COLORS = ["#fff4ea", "#fed9b8", "#fdb47c", "#f78b48", "#e3631f", "#b9470c", "#8a3307"] as const;
export const BLUE_COLORS = ["#eff4ff", "#c9dafd", "#93b4fd", "#5b86f3", "#2f5fe0", "#1a3fb0", "#0b1f4d"] as const;

export const CHART_TOKENS = {
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  axisLine: "#cbd3e1",
  grid: "#eef1f6",
  surface: "#ffffff",
  border: "#e4e9f2",
  brand: "#d21235",
  navy: "#23328c",
} as const;

/** ECharts theme "nshm": recessive axes, hairline solid grid, white tooltip card, Lexend. */
export function buildNshmTheme(fontFamily: string): Record<string, unknown> {
  const axisCommon = {
    axisLine: { show: true, lineStyle: { color: CHART_TOKENS.axisLine, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: CHART_TOKENS.textMuted, fontSize: 11.5, fontFamily },
    splitLine: { show: false, lineStyle: { color: CHART_TOKENS.grid, width: 1, type: "solid" } },
    nameTextStyle: { color: CHART_TOKENS.textMuted, fontSize: 11.5, fontFamily },
  };
  return {
    color: [...CHART_COLORS],
    backgroundColor: "transparent",
    textStyle: { fontFamily, color: CHART_TOKENS.textSecondary },
    title: { textStyle: { color: CHART_TOKENS.navy, fontFamily, fontWeight: 600 } },
    legend: {
      textStyle: { color: CHART_TOKENS.textSecondary, fontSize: 12, fontFamily },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      icon: "roundRect",
    },
    tooltip: {
      backgroundColor: "rgba(255,255,255,0.98)",
      borderColor: CHART_TOKENS.border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: CHART_TOKENS.text, fontSize: 12.5, fontFamily },
      extraCssText: "border-radius:10px;box-shadow:0 12px 32px -8px rgba(11,31,77,.22);",
      axisPointer: {
        lineStyle: { color: "#94a3b8", width: 1 },
        crossStyle: { color: "#94a3b8" },
        shadowStyle: { color: "rgba(29,78,216,0.06)" },
      },
    },
    categoryAxis: axisCommon,
    valueAxis: {
      ...axisCommon,
      axisLine: { show: false },
      splitLine: { show: true, lineStyle: { color: CHART_TOKENS.grid, width: 1, type: "solid" } },
    },
    line: { symbol: "circle", symbolSize: 7, lineStyle: { width: 2, cap: "round", join: "round" }, smooth: false },
    bar: { barMaxWidth: 24 },
    visualMap: { textStyle: { color: CHART_TOKENS.textMuted, fontFamily, fontSize: 11.5 } },
    dataZoom: {
      borderColor: CHART_TOKENS.border,
      fillerColor: "rgba(29,78,216,0.08)",
      handleStyle: { color: "#fff", borderColor: CHART_TOKENS.axisLine },
      moveHandleStyle: { color: CHART_TOKENS.axisLine },
      textStyle: { color: CHART_TOKENS.textMuted, fontFamily },
      dataBackground: { lineStyle: { color: CHART_TOKENS.axisLine }, areaStyle: { color: CHART_TOKENS.grid } },
    },
  };
}
