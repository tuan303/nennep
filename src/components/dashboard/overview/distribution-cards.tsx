"use client";
/** "Phân bổ theo mảng" (donut, click → Mảng filter) and "Ngày trong tuần" (bar chart). */
import { useMemo, useState } from "react";
import { CalendarDays, ChartPie, FilterX } from "lucide-react";
import { Button, Card, SegmentedControl, toneHex } from "@/components/ui";
import { BarChart, DonutChart } from "@/components/charts";
import { EmptyDataHint } from "@/components/app/widgets";
import { categoryBreakdown, weekdayDistribution } from "@/lib/engine";
import { fmtNumber } from "@/lib/client/format";
import type { Incident, LevelDataset } from "@/lib/types";
import { categorySlices, weekdayBars } from "../lib/view-helpers";

type Metric = "incidents" | "points";

const METRICS: Array<{ value: Metric; label: string }> = [
  { value: "incidents", label: "Sự việc" },
  { value: "points", label: "Điểm trừ" },
];

export interface CategoryCardProps {
  ds: LevelDataset;
  /** Incidents of the scope without the Mảng / error filters (cross-filter: every Mảng stays visible). */
  incidents: Incident[];
  /** Catalog category order (stable colours across filters). */
  categoryOrder: string[];
  /** Mảng filter (click on it again → clear). */
  category?: string;
  /** Mảng emphasised in the ring (the filter, or the Mảng of the filtered error); others are faded. */
  highlighted?: string;
  onPick: (category: string | undefined) => void;
  className?: string;
}

export function CategoryCard({ ds, incidents, categoryOrder, category, highlighted, onPick, className }: CategoryCardProps) {
  const [metric, setMetric] = useState<Metric>("incidents");
  const breakdown = useMemo(() => categoryBreakdown(incidents), [incidents]);
  const data = useMemo(() => categorySlices(breakdown, categoryOrder, metric, highlighted), [breakdown, categoryOrder, metric, highlighted]);

  return (
    <Card
      className={className}
      icon={ChartPie}
      title="Phân bổ theo mảng"
      subtitle={category ? `Đang lọc: ${category} · bấm lại để bỏ lọc` : highlighted ? `Lỗi đang lọc thuộc mảng ${highlighted}` : "Bấm vào một mảng để lọc"}
      actions={
        <div className="flex flex-wrap items-center gap-2" data-print-hide>
          {category ? (
            <Button variant="ghost" size="sm" icon={FilterX} onClick={() => onPick(undefined)}>
              Bỏ lọc mảng
            </Button>
          ) : null}
          <SegmentedControl size="sm" ariaLabel="Chỉ số của biểu đồ mảng" options={METRICS} value={metric} onChange={setMetric} />
        </div>
      }
    >
      {breakdown.length === 0 ? (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có sự việc trong kỳ này"} />
      ) : (
        <DonutChart
          data={data}
          legend="bottom"
          height={190}
          centerLabel={metric === "incidents" ? "sự việc" : "điểm trừ"}
          onSliceClick={(name) => {
            if (categoryOrder.includes(name)) onPick(name === category ? undefined : name);
          }}
          ariaLabel={`Phân bổ ${metric === "incidents" ? "sự việc" : "điểm trừ"} theo mảng: ${data.map((d) => `${d.name} ${fmtNumber(d.value)}`).join(", ")}`}
        />
      )}
    </Card>
  );
}

export interface WeekdayCardProps {
  ds: LevelDataset;
  incidents: Incident[];
  className?: string;
}

export function WeekdayCard({ ds, incidents, className }: WeekdayCardProps) {
  const bars = useMemo(() => weekdayBars(weekdayDistribution(incidents)), [incidents]);
  const peak = bars.values.length ? bars.full[bars.values.indexOf(Math.max(...bars.values))] : undefined;
  const total = bars.values.reduce((a, b) => a + b, 0);

  return (
    <Card className={className} icon={CalendarDays} title="Ngày trong tuần" subtitle={total > 0 && peak ? `Nhiều nhất: ${peak}` : "Sự việc theo thứ trong tuần"}>
      {total === 0 ? (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có sự việc trong kỳ này"} />
      ) : (
        <BarChart
          categories={bars.labels}
          series={[{ name: "Sự việc", data: bars.values, color: toneHex.brand }]}
          showValues
          height={230}
          ariaLabel={`Số sự việc theo thứ: ${bars.full.map((d, i) => `${d} ${bars.values[i]}`).join(", ")}`}
        />
      )}
    </Card>
  );
}
