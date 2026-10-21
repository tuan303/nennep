"use client";
/** "Theo nhóm lỗi" (REQ_V2 §6.2): bars per error group; click a bar → group filter (click again clears it). */
import { useMemo, useState } from "react";
import { ChartColumn, FilterX, Info } from "lucide-react";
import { Button, Card, Pill, SegmentedControl } from "@/components/ui";
import { BarChart, type BarClickEvent } from "@/components/charts";
import { EmptyDataHint } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import { groupBreakdown, NO_GROUP_LABEL } from "@/lib/engine";
import type { Incident, LevelDataset } from "@/lib/types";
import { GROUP_METRICS, groupBars, groupClickFilter, type GroupMetric } from "../lib/history-model";

export interface GroupCardProps {
  ds: LevelDataset;
  /** Incidents of the scope without the group / error filters (cross-filter: every group stays visible). */
  incidents: Incident[];
  /** Group filter (click on it again → clear). */
  group?: string;
  /** Group emphasised (the filter, or the group of the filtered error); the other bars are faded. */
  highlighted?: string;
  onPick: (group: string | undefined) => void;
  className?: string;
}

const UNIT: Record<GroupMetric, string> = { incidents: "sự việc", violationTurns: "lượt vi phạm", points: "điểm trừ" };

export function GroupCard({ ds, incidents, group, highlighted, onPick, className }: GroupCardProps) {
  const [metric, setMetric] = useState<GroupMetric>("incidents");
  const stats = useMemo(() => groupBreakdown(incidents, ds.catalog), [incidents, ds.catalog]);
  const bars = useMemo(() => groupBars(stats, metric, highlighted), [stats, metric, highlighted]);
  const ungrouped = stats.find((s) => s.group === NO_GROUP_LABEL);
  const label = GROUP_METRICS.find((m) => m.value === metric)?.label ?? "";

  const onBarClick = (e: BarClickEvent) => {
    const next = groupClickFilter(e.category, group);
    if (next !== null) onPick(next);
  };

  return (
    <Card
      className={className}
      icon={ChartColumn}
      title="Theo nhóm lỗi"
      subtitle={group ? `Đang lọc: ${group} · bấm lại để bỏ lọc` : highlighted ? `Lỗi đang lọc thuộc ${highlighted}` : "Bấm vào một nhóm để lọc"}
      actions={
        <div className="flex flex-wrap items-center gap-2" data-print-hide>
          {group ? (
            <Button variant="ghost" size="sm" icon={FilterX} onClick={() => onPick(undefined)}>
              Bỏ lọc nhóm
            </Button>
          ) : null}
          <SegmentedControl size="sm" ariaLabel="Chỉ số của biểu đồ nhóm lỗi" options={[...GROUP_METRICS]} value={metric} onChange={setMetric} />
        </div>
      }
      footer={
        ungrouped && ungrouped.incidents > 0 ? (
          <span className="flex items-start gap-1.5 text-xs">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            Cột “{NO_GROUP_LABEL}” gồm các lỗi chưa được gán nhóm trong danh mục – không dùng để lọc.
          </span>
        ) : undefined
      }
    >
      {incidents.length === 0 ? (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có sự việc trong kỳ này"} />
      ) : (
        <div className="flex flex-col gap-3">
          <BarChart
            categories={bars.categories}
            series={[{ name: label, data: bars.values, colors: bars.colors }]}
            showValues
            height={220}
            onBarClick={onBarClick}
            ariaLabel={`${label} theo nhóm lỗi: ${bars.categories.map((c, i) => `${c} ${fmtNumber(bars.values[i])} ${UNIT[metric]}`).join(", ")}`}
          />
          {/* Same filter without the canvas: keyboard / screen readers / large touch targets. */}
          <ul aria-label="Lọc theo nhóm lỗi" className="flex flex-wrap gap-1.5" data-print-hide>
            {bars.categories.map((c, i) => (
              <li key={c}>
                <Pill
                  active={group === c}
                  disabled={!bars.clickable[i]}
                  onClick={() => onBarClick({ category: c, seriesName: label, value: bars.values[i], index: i })}
                  aria-label={`${group === c ? "Bỏ lọc" : "Lọc theo"} ${c}: ${fmtNumber(bars.values[i])} ${UNIT[metric]}`}
                >
                  <span aria-hidden className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: bars.colors[i] }} />
                  {c} · <span className="num">{fmtNumber(bars.values[i])}</span>
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
