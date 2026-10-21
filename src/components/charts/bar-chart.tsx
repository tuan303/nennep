"use client";

import { useMemo } from "react";
import { ChartColumn } from "lucide-react";
import { EmptyState } from "../ui/states";
import { EChart, type ChartEventHandlers } from "./echart";
import { buildBarOption, isSeriesEmpty, type ChartSeries, type ValueFormatter } from "./options";

export interface BarClickEvent {
  category: string;
  seriesName: string;
  value: number;
  index: number;
}

export interface BarChartProps {
  categories: string[];
  series: ChartSeries[];
  /** Horizontal bars (rankings, top-N lists); first category on top. */
  horizontal?: boolean;
  /** Default: 280 vertical; horizontal grows with the number of categories. */
  height?: number;
  valueFormatter?: ValueFormatter;
  /** Value labels at the bar tips (single unstacked series only). */
  showValues?: boolean;
  onBarClick?: (e: BarClickEvent) => void;
  ariaLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  className?: string;
}

export function BarChart({
  categories,
  series,
  horizontal,
  height,
  valueFormatter,
  showValues,
  onBarClick,
  ariaLabel,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Không có số liệu trong phạm vi đang lọc.",
  loading,
  className,
}: BarChartProps) {
  // Keyed by content so inline arrays from callers do not re-render the canvas on every parent render.
  const dataKey = JSON.stringify([categories, series, horizontal, showValues]);
  const option = useMemo(
    () => buildBarOption({ categories, series, horizontal, valueFormatter, showValues }),
    [dataKey, valueFormatter],
  );
  const onEvents = useMemo<ChartEventHandlers | undefined>(
    () =>
      onBarClick
        ? {
            click: (p) =>
              onBarClick({
                category: p.name,
                seriesName: p.seriesName ?? "",
                value: typeof p.value === "number" ? p.value : Number(p.value) || 0,
                index: p.dataIndex,
              }),
          }
        : undefined,
    [onBarClick],
  );

  if (!loading && isSeriesEmpty(categories, series)) {
    return <EmptyState size="sm" icon={ChartColumn} title={emptyTitle} description={emptyDescription} className={className} />;
  }
  const h = height ?? (horizontal ? Math.max(180, categories.length * 34 + (series.length > 1 ? 56 : 24)) : 280);
  const label = ariaLabel ?? `Biểu đồ cột: ${series.map((s) => s.name).join(", ")} theo ${categories.length} mục`;
  return <EChart option={option} height={h} ariaLabel={label} onEvents={onEvents} loading={loading} className={className} />;
}
