"use client";
import { useCallback, useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import { Card } from "@/components/ui";
import { HeatmapChart, type HeatmapCellEvent } from "@/components/charts";
import { EmptyDataHint } from "@/components/app/widgets";
import { classWeekHeatmap, formatDayMonthVN, periodLabel } from "@/lib/engine";
import { fmtNumber } from "@/lib/client/format";
import type { GlobalFilters, LevelDataset, Period } from "@/lib/types";

export interface HeatmapCardProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  /** Wider period used when a single week is selected (one column would say little). */
  context: { period: Period; widened: boolean };
  onPickCell: (classCode: string, weekStart: string) => void;
  className?: string;
}

/** "Bản đồ nhiệt lớp × tuần" (engine classWeekHeatmap); click a cell → class + week filters. */
export function HeatmapCard({ ds, filters, today, context, onPickCell, className }: HeatmapCardProps) {
  const scope = useMemo<GlobalFilters>(() => ({ ...filters, period: context.period }), [filters, context.period]);
  const heat = useMemo(() => classWeekHeatmap(ds, scope, today), [ds, scope, today]);
  const xLabels = useMemo(() => heat.weeks.map(formatDayMonthVN), [heat.weeks]);
  const total = heat.values.reduce((a, [, , v]) => a + v, 0);
  const label = periodLabel(context.period, ds.config.semesters);

  const onCellClick = useCallback(
    (cell: HeatmapCellEvent) => {
      const week = heat.weeks[cell.x];
      const cls = heat.classes[cell.y];
      if (week && cls) onPickCell(cls, week);
    },
    [heat, onPickCell],
  );

  const subtitle = context.widened
    ? `Điểm trừ mỗi lớp theo tuần · ${label} (kỳ chứa tuần đang xem)`
    : `Điểm trừ mỗi lớp theo tuần · ${label}`;

  return (
    <Card
      className={className}
      icon={Grid3x3}
      title="Bản đồ nhiệt lớp × tuần"
      subtitle={subtitle}
      footer={
        total > 0 ? (
          <span className="text-xs">
            Ô càng đậm càng nhiều điểm trừ · {fmtNumber(heat.classes.length)} lớp × {fmtNumber(heat.weeks.length)} tuần
            <span data-print-hide> · bấm vào một ô để lọc theo lớp và tuần đó</span>
          </span>
        ) : undefined
      }
    >
      {total === 0 ? (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có điểm trừ trong kỳ này"} />
      ) : (
        <HeatmapChart
          xLabels={xLabels}
          yLabels={heat.classes}
          values={heat.values}
          onCellClick={onCellClick}
          ariaLabel={`Bản đồ nhiệt điểm trừ của ${heat.classes.length} lớp trong ${heat.weeks.length} tuần, tổng ${fmtNumber(total)} điểm`}
        />
      )}
    </Card>
  );
}
