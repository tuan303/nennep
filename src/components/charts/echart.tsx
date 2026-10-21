"use client";

import dynamic from "next/dynamic";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";
import type { ChartOption } from "./theme";

/** Subset of ECharts mouse-event params the kit relies on. */
export interface ChartEventParams {
  componentType?: string;
  seriesType?: string;
  seriesIndex?: number;
  seriesName?: string;
  name: string;
  dataIndex: number;
  value?: unknown;
  data?: unknown;
}

export type ChartEventHandlers = Record<string, (params: ChartEventParams) => void>;

export interface EChartProps {
  option: ChartOption;
  /** Pixel height (number) or CSS length. Default 280. */
  height?: number | string;
  /** Accessible summary of what the chart shows (required: the canvas is invisible to screen readers). */
  ariaLabel: string;
  onEvents?: ChartEventHandlers;
  /** Keep the previous frame at reduced opacity while new data loads (no layout jump). */
  loading?: boolean;
  /** Replace instead of merge when the option changes (default true). */
  notMerge?: boolean;
  className?: string;
}

const Inner = dynamic(() => import("./echart-inner"), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 h-full rounded-xl" />,
});

/** Themed, responsive, lazily loaded ECharts canvas ("nshm" theme, VN number formatting in the kit charts). */
export function EChart({ option, height = 280, ariaLabel, onEvents, loading, notMerge = true, className }: EChartProps) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-chart
      className={cn("relative w-full min-w-0 transition-opacity duration-200", loading && "pointer-events-none opacity-50", className)}
      style={{ height }}
    >
      <Inner option={option} height={height} onEvents={onEvents} notMerge={notMerge} />
    </div>
  );
}
