"use client";
import { useMemo, useState } from "react";
import { ChartPie, TrendingUp } from "lucide-react";
import { Card, SegmentedControl, toneHex } from "@/components/ui";
import { DonutChart, LineChart } from "@/components/charts";
import { fmtNumber } from "@/lib/client/format";
import type { categoryBreakdown } from "@/lib/engine";
import { foldSlices, type ScoreChartData } from "./lib/class-view";

type Metric = "incidents" | "points";

export interface ClassChartsProps {
  classCode: string;
  chart: ScoreChartData;
  baseScorePerWeek: number;
  categories: ReturnType<typeof categoryBreakdown>;
  periodText: string;
}

/** "Điểm thi đua theo tuần" (whole school year so far) and "Phân bổ theo mảng" (selected period). */
export function ClassCharts({ classCode, chart, baseScorePerWeek, categories, periodText }: ClassChartsProps) {
  const [metric, setMetric] = useState<Metric>("incidents");
  const series = useMemo(
    () => [
      { name: "Điểm thi đua", data: chart.score, color: toneHex.brand, area: true },
      { name: "Điểm trừ", data: chart.penalty, color: toneHex.bad },
      { name: "Điểm thưởng", data: chart.reward, color: toneHex.ok, dashed: true },
    ],
    [chart],
  );
  const markLines = useMemo(
    () => [{ value: baseScorePerWeek, label: `Điểm nền ${fmtNumber(baseScorePerWeek)}`, color: "#94a3b8" }],
    [baseScorePerWeek],
  );
  const slices = useMemo(
    () => foldSlices(categories.map((c) => ({ name: c.category, value: metric === "points" ? c.points : c.incidents }))),
    [categories, metric],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2" icon={TrendingUp} title="Điểm thi đua theo tuần" subtitle="Từ đầu năm học · mỗi tuần: điểm nền + thưởng − trừ">
        <LineChart
          categories={chart.categories}
          series={series}
          markLines={markLines}
          height={290}
          ariaLabel={`Điểm thi đua, điểm trừ và điểm thưởng theo tuần của lớp ${classCode}`}
          emptyTitle="Chưa có tuần nào được tính thi đua"
          emptyDescription="Biểu đồ sẽ hiển thị khi tuần học đầu tiên kết thúc."
        />
      </Card>
      <Card
        icon={ChartPie}
        title="Phân bổ theo mảng"
        subtitle={periodText}
        actions={
          <SegmentedControl<Metric>
            size="sm"
            ariaLabel="Chỉ số của biểu đồ"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "incidents", label: "Sự việc" },
              { value: "points", label: "Điểm trừ" },
            ]}
          />
        }
      >
        <DonutChart
          data={slices}
          centerLabel={metric === "points" ? "điểm trừ" : "sự việc"}
          legend="bottom"
          ariaLabel={`Phân bổ ${metric === "points" ? "điểm trừ" : "sự việc"} theo mảng của lớp ${classCode}`}
          emptyTitle="Chưa có sự việc trong kỳ này"
          emptyDescription="Lớp chưa bị ghi nhận sự việc nào trong kỳ đang chọn."
        />
      </Card>
    </div>
  );
}
