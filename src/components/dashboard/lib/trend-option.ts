/**
 * ECharts option for the weekly trend of the dashboard: the kit line chart plus a full-height "band" bar series on a
 * hidden 0–1 axis that (a) tints the weeks of the selected period and (b) gives every week column a click target
 * (thin lines alone are hard to tap). Pure – unit-tested.
 */
import { buildLineOption, escapeHtml, type ChartSeries, type ValueFormatter } from "@/components/charts/options";
import type { ChartOption } from "@/components/charts/theme";
import { formatNumberVN } from "@/components/ui/format";

/** Internal series name of the highlight band (excluded from tooltip and legend). */
export const TREND_BAND = "Kỳ đang xem";

const BAND_ON = "rgba(29, 78, 216, 0.09)";
const BAND_OFF = "rgba(29, 78, 216, 0)";
const VISIBLE_WINDOW = 20;

export interface TrendOptionInput {
  /** Category labels ("dd/mm"). */
  categories: string[];
  series: Array<ChartSeries & { area?: boolean; dashed?: boolean }>;
  /** Per category: inside the selected period. */
  highlight: boolean[];
  valueFormatter?: ValueFormatter;
  /** Tooltip header for a category (default "Tuần <label>"). */
  headerOf?: (index: number) => string;
}

interface TooltipParam {
  seriesName?: string;
  value?: unknown;
  color?: unknown;
  dataIndex?: number;
  name?: string;
}

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** First visible category of the zoom slider: keeps the highlighted weeks in view. */
export function zoomStart(count: number, highlight: readonly boolean[]): number {
  const fallback = Math.max(0, count - VISIBLE_WINDOW);
  const first = highlight.indexOf(true);
  if (first < 0 || first >= fallback) return fallback;
  return Math.max(0, first - 2);
}

export function buildTrendOption({ categories, series, highlight, valueFormatter = formatNumberVN, headerOf }: TrendOptionInput): ChartOption {
  const zoom = categories.length > 26;
  const base = buildLineOption({ categories, series, valueFormatter, zoom }) as Record<string, unknown>;
  const lines = (base.series as unknown[]) ?? [];

  const band = {
    type: "bar" as const,
    name: TREND_BAND,
    yAxisIndex: 1,
    barWidth: "100%",
    // The "nshm" theme caps bars at 24px; the band must fill the whole week column.
    barMaxWidth: "100%",
    barCategoryGap: "0%",
    barGap: "-100%",
    z: 0,
    cursor: "pointer",
    legendHoverLink: false,
    emphasis: { disabled: true },
    tooltip: { show: false },
    data: categories.map((_, i) => ({ value: 1, itemStyle: { color: highlight[i] ? BAND_ON : BAND_OFF } })),
  };

  const header = (idx: number, fallback: string) => escapeHtml(headerOf ? headerOf(idx) : `Tuần ${fallback}`);
  const tooltip = {
    trigger: "axis" as const,
    axisPointer: { type: "line" as const },
    formatter: (raw: unknown) => {
      const list = (Array.isArray(raw) ? raw : [raw]) as TooltipParam[];
      const rows = list.filter((p) => p.seriesName !== TREND_BAND);
      const first = list[0];
      const idx = typeof first?.dataIndex === "number" ? first.dataIndex : 0;
      const head = `<div style="font-weight:600;margin-bottom:4px">${header(idx, first?.name ?? "")}${
        highlight[idx] ? ` <span style="font-weight:500;color:#23328c">· ${escapeHtml(TREND_BAND.toLowerCase())}</span>` : ""
      }</div>`;
      const body = rows
        .map(
          (p) =>
            `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between"><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:999px;background:${escapeHtml(
              String(p.color ?? ""),
            )}"></span>${escapeHtml(p.seriesName ?? "")}</span><b>${escapeHtml(valueFormatter(toNumber(p.value)))}</b></div>`,
        )
        .join("");
      return head + body;
    },
  };

  const legend = series.length > 1 ? { ...(base.legend as object), data: series.map((s) => s.name) } : base.legend;
  const dataZoom = zoom
    ? [
        { type: "slider", xAxisIndex: 0, height: 18, bottom: 6, startValue: zoomStart(categories.length, highlight), brushSelect: false },
        { type: "inside", xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
      ]
    : undefined;

  return {
    ...base,
    legend,
    tooltip,
    dataZoom,
    yAxis: [base.yAxis as object, { type: "value", min: 0, max: 1, show: false }],
    series: categories.length > 0 ? [band, ...lines] : lines,
  } as ChartOption;
}
