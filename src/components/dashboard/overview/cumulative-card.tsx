"use client";
/** "Điểm trừ cộng dồn" (REQ_V2 §6.2): cumulative penalty by week across the school year (Toàn cấp / khối / lớp). */
import { useMemo, useState } from "react";
import { ChartSpline, MousePointerClick } from "lucide-react";
import { Card, SegmentedControl } from "@/components/ui";
import { EChart, type ChartEventHandlers } from "@/components/charts";
import { EmptyDataHint } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import { cumulativePenalty } from "@/lib/engine";
import type { GlobalFilters, LevelDataset } from "@/lib/types";
import { CUMULATIVE_MODES, cumulativeLines, finalValue, weekHighlight, type CumulativeMode } from "../lib/history-model";
import { buildTrendOption } from "../lib/trend-option";

export interface CumulativeCardProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  /** Click on a week column → filter that week. */
  onPickWeek?: (weekStart: string) => void;
  /** Initial grouping (default "total"; Khối & lớp overview starts "Theo khối"). */
  defaultMode?: CumulativeMode;
  className?: string;
}

const SUBTITLE: Record<CumulativeMode, string> = {
  total: "Tổng điểm trừ tích lũy từ đầu năm học",
  grade: "Mỗi đường là một khối",
  class: "5 lớp có điểm trừ cộng dồn cao nhất (và lớp đang lọc)",
};

export function CumulativeCard({ ds, filters, today, onPickWeek, defaultMode = "total", className }: CumulativeCardProps) {
  const [mode, setMode] = useState<CumulativeMode>(defaultMode);
  const cp = useMemo(() => cumulativePenalty(ds, filters, today, { by: mode }), [ds, filters, today, mode]);
  const lines = useMemo(() => cumulativeLines(cp, mode, { classCode: filters.classCode }), [cp, mode, filters.classCode]);
  const highlight = useMemo(() => weekHighlight(cp.weeks, filters.period, ds.weeks), [cp.weeks, filters.period, ds.weeks]);
  const hasData = lines.some((l) => finalValue(l) > 0);

  const option = useMemo(
    () =>
      buildTrendOption({
        categories: cp.labels,
        series: lines.map((l) => ({ name: l.name, data: l.data, color: l.color, dashed: l.dashed, area: l.area })),
        highlight,
        headerOf: (i) => `Đến tuần ${cp.labels[i] ?? ""}`,
      }),
    [cp.labels, lines, highlight],
  );
  const onEvents = useMemo<ChartEventHandlers | undefined>(
    () =>
      onPickWeek
        ? {
            click: (p) => {
              const week = cp.weeks[p.dataIndex];
              if (week) onPickWeek(week);
            },
          }
        : undefined,
    [cp.weeks, onPickWeek],
  );

  const selectedCount = highlight.filter(Boolean).length;
  const total = lines.find((l) => !l.dashed);
  const ariaLabel = `Điểm trừ cộng dồn theo tuần (${CUMULATIVE_MODES.find((m) => m.value === mode)?.label}): ${lines
    .map((l) => `${l.name} ${fmtNumber(finalValue(l))} điểm`)
    .join(", ")}`;

  return (
    <Card
      className={className}
      icon={ChartSpline}
      title="Điểm trừ cộng dồn"
      subtitle={SUBTITLE[mode]}
      actions={
        <div data-print-hide>
          <SegmentedControl size="sm" ariaLabel="Cách nhóm điểm trừ cộng dồn" options={[...CUMULATIVE_MODES]} value={mode} onChange={setMode} />
        </div>
      }
      footer={
        hasData ? (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {mode === "total" && total ? (
              <span className="num">
                Đến nay: <strong className="font-semibold text-brand-900">{fmtNumber(finalValue(total))} điểm trừ</strong>
              </span>
            ) : null}
            {selectedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-4 rounded-[3px] bg-brand-100 ring-1 ring-inset ring-brand-200" />
                Vùng tô nền: kỳ đang xem ({selectedCount} tuần)
              </span>
            ) : null}
            {onPickWeek ? (
              <span className="inline-flex items-center gap-1.5" data-print-hide>
                <MousePointerClick aria-hidden className="size-3.5 text-slate-400" />
                Bấm vào một tuần để xem tuần đó
              </span>
            ) : null}
          </span>
        ) : undefined
      }
    >
      {hasData ? (
        <div className="relative h-full min-h-[300px]">
          <EChart option={option} height="100%" ariaLabel={ariaLabel} onEvents={onEvents} className="absolute inset-0" />
        </div>
      ) : (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có điểm trừ trong phạm vi đang lọc"} />
      )}
    </Card>
  );
}
