/**
 * Pure ECharts option builders (no React, no echarts runtime) – unit-tested in options.test.ts.
 * Mark specs: bars ≤24px with 4px rounded data-end, 2px lines, hairline solid grid, legend only for ≥2 series.
 */
import type { BarSeriesOption, HeatmapSeriesOption, LineSeriesOption, PieSeriesOption } from "echarts/charts";
import { formatCompactVN, formatNumberVN } from "../ui/format";
import { CHART_TOKENS, HEAT_COLORS, chartColor, type ChartOption } from "./theme";

export type ValueFormatter = (value: number) => string;

export interface ChartSeries {
  name: string;
  data: Array<number | null>;
  /** Fixed colour for this entity (keep it stable across filters). Default: palette slot by index. */
  color?: string;
  /** Series with the same stack id are stacked. */
  stack?: string;
  /**
   * Bar charts only: colour per data point (e.g. the selected bar in full colour, the others faded). Missing entries
   * keep the series colour.
   */
  colors?: ReadonlyArray<string | null | undefined>;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return toNumber(v[v.length - 1]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** True when there is nothing to plot (no categories or every value missing). */
export function isSeriesEmpty(categories: readonly string[], series: ReadonlyArray<{ data: Array<number | null> }>): boolean {
  if (categories.length === 0 || series.length === 0) return true;
  return series.every((s) => s.data.every((v) => v === null || v === undefined || Number.isNaN(v)));
}

/** Legend only for ≥2 series. Lines get a short line key, bars/areas a rounded square. */
const legendFor = (n: number, key: "rect" | "line" = "rect") =>
  n > 1
    ? {
        show: true,
        top: 0,
        left: 0,
        type: "scroll" as const,
        ...(key === "line" ? { icon: "path://M0,0 L16,0 L16,3 L0,3 Z", itemWidth: 16, itemHeight: 3 } : {}),
      }
    : { show: false };

/* ---------------------------------- Bar ---------------------------------- */

export interface BarOptionInput {
  categories: string[];
  series: ChartSeries[];
  horizontal?: boolean;
  valueFormatter?: ValueFormatter;
  /** Value at the bar tip (only for a single, unstacked series). */
  showValues?: boolean;
}

export function buildBarOption({ categories, series, horizontal, valueFormatter = formatNumberVN, showValues }: BarOptionInput): ChartOption {
  const stacked = series.some((s) => s.stack);
  // Last series of each stack carries the rounded data-end.
  const lastOfStack = new Map<string, number>();
  series.forEach((s, i) => lastOfStack.set(s.stack ?? `__${i}`, i));
  const radius = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  const labelsOn = !!showValues && series.length === 1 && !stacked;

  const barSeries: BarSeriesOption[] = series.map((s, i) => {
    const roundEnd = lastOfStack.get(s.stack ?? `__${i}`) === i;
    const data = s.colors
      ? s.data.map((v, j) => {
          const c = s.colors?.[j];
          return c ? { value: v, itemStyle: { color: c } } : v;
        })
      : s.data;
    return {
      type: "bar",
      name: s.name,
      data,
      stack: s.stack,
      barMaxWidth: 24,
      barGap: "20%",
      barCategoryGap: horizontal ? "35%" : "40%",
      itemStyle: {
        color: s.color ?? chartColor(i),
        borderRadius: roundEnd ? radius : 0,
        ...(s.stack ? { borderColor: CHART_TOKENS.surface, borderWidth: 1 } : {}),
      },
      emphasis: { focus: "none", itemStyle: { opacity: 0.85 } },
      label: labelsOn
        ? {
            show: true,
            position: horizontal ? "right" : "top",
            distance: 6,
            color: CHART_TOKENS.textSecondary,
            fontSize: 11.5,
            fontWeight: 600,
            formatter: (p: { value?: unknown }) => valueFormatter(toNumber(p.value)),
          }
        : { show: false },
    };
  });

  const categoryAxis = {
    type: "category" as const,
    data: categories,
    inverse: !!horizontal,
    axisLabel: horizontal ? { width: 112, overflow: "truncate" as const, hideOverlap: true } : { hideOverlap: true, interval: "auto" as const },
  };
  const valueAxis = {
    type: "value" as const,
    axisLabel: { formatter: (v: number) => formatCompactVN(v) },
    splitNumber: 4,
  };

  const base: ChartOption = {
    legend: legendFor(series.length),
    grid: { left: 4, right: labelsOn && horizontal ? 44 : 12, top: series.length > 1 ? 36 : labelsOn && !horizontal ? 22 : 10, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => valueFormatter(toNumber(v)) },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: barSeries,
  };
  if (!horizontal) return base;
  // Category labels get more room on wide containers (ECharts media queries follow the chart's own size).
  return {
    baseOption: base,
    media: [
      { query: { minWidth: 520 }, option: { yAxis: { axisLabel: { width: 220 } } } },
      { query: { minWidth: 380, maxWidth: 519 }, option: { yAxis: { axisLabel: { width: 150 } } } },
      { option: { yAxis: { axisLabel: { width: 112 } } } },
    ],
  };
}

/* ---------------------------------- Line --------------------------------- */

export interface MarkLineInput {
  value: number;
  label?: string;
  color?: string;
}

export interface LineOptionInput {
  categories: string[];
  series: Array<ChartSeries & { dashed?: boolean; area?: boolean }>;
  /** Area wash under every series (10%). */
  area?: boolean;
  markLines?: MarkLineInput[];
  valueFormatter?: ValueFormatter;
  smooth?: boolean;
  /** Slider to zoom along x (default: when > 26 categories). */
  zoom?: boolean;
}

export function buildLineOption({ categories, series, area, markLines, valueFormatter = formatNumberVN, smooth, zoom }: LineOptionInput): ChartOption {
  const showSymbol = categories.length <= 16;
  const useZoom = zoom ?? categories.length > 26;
  const lineSeries: LineSeriesOption[] = series.map((s, i) => {
    const color = s.color ?? chartColor(i);
    const withArea = s.area ?? area;
    return {
      type: "line",
      name: s.name,
      data: s.data,
      stack: s.stack,
      smooth: smooth ? 0.3 : false,
      showSymbol,
      symbol: "circle",
      symbolSize: 7,
      connectNulls: false,
      lineStyle: { width: 2, color, type: s.dashed ? "dashed" : "solid" },
      itemStyle: { color, borderColor: CHART_TOKENS.surface, borderWidth: 2 },
      areaStyle: withArea
        ? {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}29` },
                { offset: 1, color: `${color}05` },
              ],
            },
          }
        : undefined,
      emphasis: { focus: "series", scale: 1.3 },
      markLine:
        i === 0 && markLines && markLines.length > 0
          ? {
              silent: true,
              symbol: "none",
              data: markLines.map((m) => ({
                yAxis: m.value,
                lineStyle: { color: m.color ?? "#d97706", type: "dashed", width: 1.5 },
                label: {
                  show: !!m.label,
                  formatter: m.label ?? "",
                  position: "insideEndTop",
                  color: m.color ?? "#b45309",
                  fontSize: 11,
                  fontWeight: 600,
                },
              })),
            }
          : undefined,
    };
  });

  return {
    legend: legendFor(series.length, "line"),
    grid: { left: 4, right: 16, top: series.length > 1 ? 36 : 14, bottom: useZoom ? 44 : 4, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "line" }, valueFormatter: (v) => valueFormatter(toNumber(v)) },
    xAxis: { type: "category", data: categories, boundaryGap: false, axisLabel: { hideOverlap: true } },
    yAxis: { type: "value", splitNumber: 4, axisLabel: { formatter: (v: number) => formatCompactVN(v) } },
    dataZoom: useZoom
      ? [
          { type: "slider", xAxisIndex: 0, height: 18, bottom: 6, startValue: Math.max(0, categories.length - 20), brushSelect: false },
          { type: "inside", xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
        ]
      : undefined,
    series: lineSeries,
  };
}

/* ---------------------------------- Donut -------------------------------- */

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

export function donutTotal(data: readonly DonutDatum[]): number {
  return data.reduce((a, d) => a + (Number.isFinite(d.value) && d.value > 0 ? d.value : 0), 0);
}

export function buildDonutOption(data: DonutDatum[], valueFormatter: ValueFormatter = formatNumberVN): ChartOption {
  const total = donutTotal(data) || 1;
  const pie: PieSeriesOption = {
    type: "pie",
    radius: ["64%", "92%"],
    center: ["50%", "50%"],
    avoidLabelOverlap: false,
    padAngle: 1.2,
    itemStyle: { borderRadius: 4, borderColor: CHART_TOKENS.surface, borderWidth: 1 },
    label: { show: false },
    labelLine: { show: false },
    emphasis: { scale: true, scaleSize: 4, label: { show: false } },
    data: data.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: d.color ?? chartColor(i) } })),
  };
  return {
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const q = p as { name?: string; value?: unknown; color?: string };
        const v = toNumber(q.value);
        const pct = Math.round((v / total) * 1000) / 10;
        return `<div style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:3px;background:${escapeHtml(String(q.color ?? ""))}"></span><span>${escapeHtml(q.name ?? "")}</span></div><div style="margin-top:2px;font-weight:700;font-size:14px">${escapeHtml(valueFormatter(v))} <span style="font-weight:500;color:${CHART_TOKENS.textMuted}">· ${pct.toLocaleString("vi-VN")}%</span></div>`;
      },
    },
    series: [pie],
  };
}

/* --------------------------------- Heatmap ------------------------------- */

export interface HeatmapOptionInput {
  xLabels: string[];
  yLabels: string[];
  values: Array<[number, number, number]>;
  valueLabel?: string;
  valueFormatter?: ValueFormatter;
  colors?: readonly string[];
  max?: number;
  /** Rows visible before a vertical slider appears. */
  maxRows?: number;
  showCellValues?: boolean;
}

export function heatmapMax(values: ReadonlyArray<[number, number, number]>): number {
  return values.reduce((m, [, , v]) => (Number.isFinite(v) && v > m ? v : m), 0);
}

export function buildHeatmapOption({
  xLabels,
  yLabels,
  values,
  valueLabel = "Điểm trừ",
  valueFormatter = formatNumberVN,
  colors = HEAT_COLORS,
  max,
  maxRows = 30,
  showCellValues,
}: HeatmapOptionInput): ChartOption {
  const vmax = Math.max(1, max ?? heatmapMax(values));
  const scroll = yLabels.length > maxRows;
  const labels = showCellValues ?? xLabels.length * yLabels.length <= 400;
  const series: HeatmapSeriesOption = {
    type: "heatmap",
    data: values,
    itemStyle: { borderColor: CHART_TOKENS.surface, borderWidth: 2, borderRadius: 4 },
    emphasis: { itemStyle: { borderColor: CHART_TOKENS.navy, borderWidth: 2 } },
    label: {
      show: labels,
      fontSize: 10.5,
      fontWeight: 600,
      color: CHART_TOKENS.text,
      textBorderColor: "rgba(255,255,255,0.85)",
      textBorderWidth: 2,
      formatter: (p: { value?: unknown }) => {
        const v = Array.isArray(p.value) ? toNumber(p.value[2]) : 0;
        return v > 0 ? valueFormatter(v) : "";
      },
    },
  };
  return {
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const q = p as { value?: unknown };
        const arr = Array.isArray(q.value) ? q.value : [0, 0, 0];
        const x = xLabels[toNumber(arr[0])] ?? "";
        const y = yLabels[toNumber(arr[1])] ?? "";
        return `<div style="color:${CHART_TOKENS.textMuted}">${escapeHtml(y)} · ${escapeHtml(x)}</div><div style="margin-top:2px;font-weight:700;font-size:14px">${escapeHtml(valueFormatter(toNumber(arr[2])))} <span style="font-weight:500;color:${CHART_TOKENS.textMuted}">${escapeHtml(valueLabel)}</span></div>`;
      },
    },
    grid: { left: 4, right: scroll ? 30 : 8, top: 8, bottom: 52, containLabel: true },
    xAxis: { type: "category", data: xLabels, splitArea: { show: false }, axisLine: { show: false }, axisLabel: { hideOverlap: true } },
    yAxis: { type: "category", data: yLabels, inverse: true, axisLine: { show: false }, axisLabel: { fontWeight: 600 } },
    visualMap: {
      type: "continuous",
      min: 0,
      max: vmax,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 10,
      itemHeight: 140,
      text: ["Cao", "Thấp"],
      inRange: { color: [...colors] },
      formatter: (v: unknown) => valueFormatter(toNumber(v)),
    },
    dataZoom: scroll
      ? [{ type: "slider", yAxisIndex: 0, right: 2, width: 14, startValue: 0, endValue: maxRows - 1, zoomLock: true, showDetail: false, brushSelect: false }]
      : undefined,
    series: [series],
  };
}
