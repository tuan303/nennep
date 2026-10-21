"use client";

import { useMemo } from "react";
import { ChartLine } from "lucide-react";
import { EmptyState } from "../ui/states";
import { EChart, type ChartEventHandlers } from "./echart";
import { buildBumpOption, bumpTotal, type BumpLine } from "./bump-option";
import type { ValueFormatter } from "./options";

export interface BumpChartProps {
  /** Category labels ("dd/mm"). */
  categories: string[];
  lines: BumpLine[];
  /** Population size N (y axis 1…N). Default: the largest rank. */
  total?: number;
  /** Show the faded (non-emphasised) lines. Default true; each line can also be toggled from the legend. */
  showFaded?: boolean;
  /** Tooltip header of a category (default "Tuần <label>"). */
  headerOf?: (index: number) => string;
  scoreFormatter?: ValueFormatter;
  height?: number;
  /** Click on a line / point → its name (e.g. a class code). */
  onLineClick?: (name: string) => void;
  ariaLabel: string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  className?: string;
}

/** Rank movement over time (1 on top). Lines of the emphasised entities are coloured; the others stay faded. */
export function BumpChart({
  categories,
  lines,
  total,
  showFaded = true,
  headerOf,
  scoreFormatter,
  height,
  onLineClick,
  ariaLabel,
  emptyTitle = "Chưa có dữ liệu xếp hạng",
  emptyDescription = "Biểu đồ sẽ hiển thị khi có tuần được tính thi đua.",
  loading,
  className,
}: BumpChartProps) {
  // Keyed by content so inline arrays from callers do not re-render the canvas on every parent render.
  const dataKey = JSON.stringify([categories, lines, total, showFaded]);
  const option = useMemo(
    () => buildBumpOption({ categories, lines, total, showFaded, headerOf, scoreFormatter }),
    [dataKey, headerOf, scoreFormatter],
  );
  const onEvents = useMemo<ChartEventHandlers | undefined>(
    () => (onLineClick ? { click: (p) => (p.seriesName ? onLineClick(p.seriesName) : undefined) } : undefined),
    [onLineClick],
  );
  const empty = categories.length === 0 || lines.length === 0 || lines.every((l) => l.ranks.every((r) => r === null || r === undefined));
  if (!loading && empty) {
    return <EmptyState size="sm" icon={ChartLine} title={emptyTitle} description={emptyDescription} className={className} />;
  }
  const n = total ?? bumpTotal(lines);
  const h = height ?? Math.min(520, Math.max(260, 120 + n * 26));
  return <EChart option={option} height={h} ariaLabel={ariaLabel} onEvents={onEvents} loading={loading} className={className} />;
}
