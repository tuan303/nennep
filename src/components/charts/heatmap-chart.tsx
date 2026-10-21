"use client";

import { useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import { EmptyState } from "../ui/states";
import { EChart, type ChartEventHandlers } from "./echart";
import { buildHeatmapOption, type ValueFormatter } from "./options";

export interface HeatmapCellEvent {
  x: number;
  y: number;
  xLabel: string;
  yLabel: string;
  value: number;
}

export interface HeatmapChartProps {
  /** Column labels (e.g. weeks "12/10"). */
  xLabels: string[];
  /** Row labels (e.g. classes "6A01"); first row on top. */
  yLabels: string[];
  /** [xIndex, yIndex, value] – zeros may be omitted or included. */
  values: Array<[number, number, number]>;
  /** Default: grows with rows (26px each, up to `maxRows`). */
  height?: number;
  /** Unit in the tooltip, default "Điểm trừ". */
  valueLabel?: string;
  valueFormatter?: ValueFormatter;
  onCellClick?: (cell: HeatmapCellEvent) => void;
  /** Single-hue ramp light → dark (default orange heat). */
  colors?: readonly string[];
  /** Fix the colour scale maximum (compare several heatmaps). */
  max?: number;
  /** Rows shown before a vertical slider appears (default 30). */
  maxRows?: number;
  showCellValues?: boolean;
  ariaLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  className?: string;
}

/** Class × week intensity grid (sequential single-hue scale with legend). */
export function HeatmapChart({
  xLabels,
  yLabels,
  values,
  height,
  valueLabel = "Điểm trừ",
  valueFormatter,
  onCellClick,
  colors,
  max,
  maxRows = 30,
  showCellValues,
  ariaLabel,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Không có số liệu trong phạm vi đang lọc.",
  loading,
  className,
}: HeatmapChartProps) {
  const dataKey = JSON.stringify([xLabels, yLabels, values, valueLabel, colors, max, maxRows, showCellValues]);
  const option = useMemo(
    () => buildHeatmapOption({ xLabels, yLabels, values, valueLabel, valueFormatter, colors, max, maxRows, showCellValues }),
    [dataKey, valueFormatter],
  );
  const onEvents = useMemo<ChartEventHandlers | undefined>(
    () =>
      onCellClick
        ? {
            click: (p) => {
              const v = Array.isArray(p.value) ? (p.value as unknown[]) : [];
              const x = Number(v[0]);
              const y = Number(v[1]);
              onCellClick({ x, y, xLabel: xLabels[x] ?? "", yLabel: yLabels[y] ?? "", value: Number(v[2]) || 0 });
            },
          }
        : undefined,
    [onCellClick, xLabels, yLabels],
  );

  if (!loading && (xLabels.length === 0 || yLabels.length === 0)) {
    return <EmptyState size="sm" icon={Grid3x3} title={emptyTitle} description={emptyDescription} className={className} />;
  }
  const h = height ?? Math.max(220, Math.min(yLabels.length, maxRows) * 26 + 96);
  const label = ariaLabel ?? `Bản đồ nhiệt ${valueLabel.toLowerCase()}: ${yLabels.length} hàng × ${xLabels.length} cột`;
  return <EChart option={option} height={h} ariaLabel={label} onEvents={onEvents} loading={loading} className={className} />;
}
