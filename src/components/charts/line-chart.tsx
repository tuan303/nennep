"use client";

import { useMemo } from "react";
import { ChartLine } from "lucide-react";
import { EmptyState } from "../ui/states";
import { EChart, type ChartEventHandlers } from "./echart";
import { buildLineOption, isSeriesEmpty, type ChartSeries, type MarkLineInput, type ValueFormatter } from "./options";

export interface LineSeries extends ChartSeries {
  dashed?: boolean;
  /** Per-series area wash (overrides `area`). */
  area?: boolean;
}

export interface LineChartProps {
  categories: string[];
  series: LineSeries[];
  /** Soft 10% area under every line. */
  area?: boolean;
  height?: number;
  /** Horizontal reference lines (e.g. RAG thresholds) – dashed, labelled. */
  markLines?: MarkLineInput[];
  valueFormatter?: ValueFormatter;
  smooth?: boolean;
  /** Slider along x (default when > 26 points). */
  zoom?: boolean;
  onPointClick?: (e: { category: string; seriesName: string; value: number; index: number }) => void;
  ariaLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  className?: string;
}

/** Trend over time (single y-axis, crosshair tooltip with every series). */
export function LineChart({
  categories,
  series,
  area,
  height = 280,
  markLines,
  valueFormatter,
  smooth,
  zoom,
  onPointClick,
  ariaLabel,
  emptyTitle = "Chưa có dữ liệu xu hướng",
  emptyDescription = "Số liệu sẽ hiển thị khi có sự việc được ghi nhận.",
  loading,
  className,
}: LineChartProps) {
  const dataKey = JSON.stringify([categories, series, area, markLines, smooth, zoom]);
  const option = useMemo(
    () => buildLineOption({ categories, series, area, markLines, valueFormatter, smooth, zoom }),
    [dataKey, valueFormatter],
  );
  const onEvents = useMemo<ChartEventHandlers | undefined>(
    () =>
      onPointClick
        ? {
            click: (p) =>
              onPointClick({
                category: p.name,
                seriesName: p.seriesName ?? "",
                value: typeof p.value === "number" ? p.value : Number(p.value) || 0,
                index: p.dataIndex,
              }),
          }
        : undefined,
    [onPointClick],
  );
  if (!loading && isSeriesEmpty(categories, series)) {
    return <EmptyState size="sm" icon={ChartLine} title={emptyTitle} description={emptyDescription} className={className} />;
  }
  const label = ariaLabel ?? `Biểu đồ đường: ${series.map((s) => s.name).join(", ")} qua ${categories.length} mốc`;
  return <EChart option={option} height={height} ariaLabel={label} onEvents={onEvents} loading={loading} className={className} />;
}
