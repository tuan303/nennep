"use client";
import { useMemo, useState } from "react";
import { MousePointerClick, TrendingUp } from "lucide-react";
import { Card, SegmentedControl, toneHex } from "@/components/ui";
import { EChart, type ChartEventHandlers } from "@/components/charts";
import { EmptyDataHint } from "@/components/app/widgets";
import type { TrendPoint } from "@/lib/engine";
import type { LevelDataset, Period } from "@/lib/types";
import { trendHighlight } from "../lib/overview-model";
import { buildTrendOption } from "../lib/trend-option";

type Metric = "points" | "incidents";

const METRICS: Array<{ value: Metric; label: string }> = [
  { value: "points", label: "Điểm" },
  { value: "incidents", label: "Sự việc" },
];

export interface TrendCardProps {
  ds: LevelDataset;
  trend: TrendPoint[];
  period: Period;
  /** Click on a week column → filter that week. */
  onPickWeek: (weekStart: string) => void;
  className?: string;
}

/** "Xu hướng theo tuần": whole school year up to today; the weeks of the selected period are tinted. */
export function TrendCard({ ds, trend, period, onPickWeek, className }: TrendCardProps) {
  const [metric, setMetric] = useState<Metric>("points");
  const highlight = useMemo(() => trendHighlight(trend, period, ds.weeks), [trend, period, ds.weeks]);
  const hasData = trend.some((t) => t.incidents > 0 || t.rewards > 0);

  const option = useMemo(() => {
    const categories = trend.map((t) => t.label);
    const series =
      metric === "points"
        ? [
            { name: "Điểm trừ", data: trend.map((t) => t.points), color: toneHex.bad, area: true },
            { name: "Điểm thưởng", data: trend.map((t) => t.rewards), color: toneHex.star },
          ]
        : [{ name: "Sự việc", data: trend.map((t) => t.incidents), color: toneHex.brand, area: true }];
    return buildTrendOption({ categories, series, highlight, headerOf: (i) => `Tuần ${trend[i]?.label ?? ""}` });
  }, [trend, metric, highlight]);

  const onEvents = useMemo<ChartEventHandlers>(
    () => ({
      click: (p) => {
        const week = trend[p.dataIndex]?.week;
        if (week) onPickWeek(week);
      },
    }),
    [trend, onPickWeek],
  );

  const selectedCount = highlight.filter(Boolean).length;
  const ariaLabel =
    metric === "points"
      ? `Điểm trừ và điểm thưởng theo tuần trong ${trend.length} tuần của năm học`
      : `Số sự việc theo tuần trong ${trend.length} tuần của năm học`;

  return (
    <Card
      className={className}
      icon={TrendingUp}
      title="Xu hướng theo tuần"
      subtitle="Từ đầu năm học đến tuần hiện tại"
      actions={
        <div data-print-hide>
          <SegmentedControl size="sm" ariaLabel="Chỉ số của biểu đồ xu hướng" options={METRICS} value={metric} onChange={setMetric} />
        </div>
      }
      footer={
        hasData ? (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {selectedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-4 rounded-[3px] bg-brand-100 ring-1 ring-inset ring-brand-200" />
                Vùng tô nền: kỳ đang xem ({selectedCount} tuần)
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5" data-print-hide>
              <MousePointerClick aria-hidden className="size-3.5 text-slate-400" />
              Bấm vào một tuần để xem chi tiết tuần đó
            </span>
          </span>
        ) : undefined
      }
    >
      {hasData ? (
        // Fills the card when the row is stretched by a taller neighbour (desktop), 300px otherwise.
        <div className="relative h-full min-h-[300px]">
          <EChart option={option} height="100%" ariaLabel={ariaLabel} onEvents={onEvents} className="absolute inset-0" />
        </div>
      ) : (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có sự việc trong phạm vi đang lọc"} />
      )}
    </Card>
  );
}
