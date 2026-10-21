/**
 * NSHM charts – import from "@/components/charts".
 * ECharts is lazy-loaded (client only); Sparkline is plain SVG.
 */
export { EChart, type EChartProps, type ChartEventParams, type ChartEventHandlers } from "./echart";
export { BarChart, type BarChartProps, type BarClickEvent } from "./bar-chart";
export { LineChart, type LineChartProps, type LineSeries } from "./line-chart";
export { DonutChart, type DonutChartProps } from "./donut-chart";
export { HeatmapChart, type HeatmapChartProps, type HeatmapCellEvent } from "./heatmap-chart";
export { BumpChart, type BumpChartProps } from "./bump-chart";
export {
  buildBumpOption,
  bumpColors,
  bumpPointText,
  bumpTotal,
  BUMP_FADED_COLOR,
  BUMP_HIGHLIGHT_COLOR,
  type BumpEmphasis,
  type BumpLine,
  type BumpOptionInput,
} from "./bump-option";
export { Sparkline, sparklinePoints, type SparklineProps } from "./sparkline";
export {
  CHART_COLORS,
  CHART_OTHER_COLOR,
  HEAT_COLORS,
  BLUE_COLORS,
  CHART_TOKENS,
  chartColor,
  buildNshmTheme,
  type ChartOption,
} from "./theme";
export {
  buildBarOption,
  buildLineOption,
  buildDonutOption,
  buildHeatmapOption,
  isSeriesEmpty,
  donutTotal,
  heatmapMax,
  escapeHtml,
  type ChartSeries,
  type DonutDatum,
  type MarkLineInput,
  type ValueFormatter,
} from "./options";
