"use client";
/** "So sánh giữa các cấp" (normalised bars) and "Xu hướng theo tuần" (one line per level). */
import { useMemo, useState } from "react";
import { ChartColumn, TrendingUp } from "lucide-react";
import { Card, SegmentedControl, toneHex } from "@/components/ui";
import { BarChart, LineChart } from "@/components/charts";
import { fmtNumber } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import type { LevelSummary, MergedTrend, TrendMetric } from "../lib/school-model";
import { RagStrip } from "../shared/parts";

type CompareMetric = "per100" | "penaltyPerClass" | "rewardPerClass";

const COMPARE_OPTIONS: Array<{ value: CompareMetric; label: string }> = [
  { value: "per100", label: "Sự việc/100 HS" },
  { value: "penaltyPerClass", label: "Điểm trừ/lớp" },
  { value: "rewardPerClass", label: "Thưởng/lớp" },
];

const COMPARE_TEXT: Record<CompareMetric, { series: string; help: string; color: string }> = {
  per100: { series: "Sự việc / 100 HS", help: "Số sự việc trên 100 học sinh đang học", color: toneHex.brand },
  penaltyPerClass: { series: "Điểm trừ / lớp", help: "Điểm trừ trung bình mỗi lớp đang hoạt động", color: toneHex.bad },
  rewardPerClass: { series: "Điểm thưởng / lớp", help: "Điểm thưởng (được tính) trung bình mỗi lớp", color: toneHex.star },
};

function metricValue(s: LevelSummary, m: CompareMetric): number | null {
  if (m === "per100") return s.incidentsPer100 ?? null;
  return m === "penaltyPerClass" ? s.penaltyPerClass : s.rewardPerClass;
}

export function CompareCard({ summaries, className }: { summaries: LevelSummary[]; className?: string }) {
  const [metric, setMetric] = useState<CompareMetric>("per100");
  const text = COMPARE_TEXT[metric];
  const categories = summaries.map((s) => s.name);
  const values = summaries.map((s) => metricValue(s, metric));
  const series = [{ name: text.series, data: values, color: text.color }];

  return (
    <Card
      className={className}
      icon={ChartColumn}
      title="So sánh giữa các cấp"
      subtitle={`${text.help} · đã quy đổi để các cấp so sánh được`}
      actions={
        <div data-print-hide>
          <SegmentedControl size="sm" ariaLabel="Chỉ số so sánh" options={COMPARE_OPTIONS} value={metric} onChange={setMetric} />
        </div>
      }
    >
      <BarChart
        horizontal
        categories={categories}
        series={series}
        showValues
        valueFormatter={(v) => fmtNumber(v, 1)}
        ariaLabel={`${text.series} theo cấp học: ${summaries.map((s, i) => `${s.name} ${values[i] === null ? "chưa có" : fmtNumber(values[i], 1)}`).join(", ")}`}
        emptyTitle="Chưa có dữ liệu để so sánh"
      />
      <PeriodNote summaries={summaries} />
      <div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tỷ lệ lớp theo trạng thái RAG</p>
        <ul className="flex flex-col gap-2.5">
          {summaries.map((s) => (
            <li key={s.levelId} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
              <span className="truncate font-medium text-slate-700">{LEVELS[s.levelId].short}</span>
              <RagStrip counts={s.rag} total={s.classCount} />
              <span className="num text-xs text-slate-500">
                <b className="text-ok-strong">{fmtNumber(s.rag.GREEN)}</b>/{fmtNumber(s.classCount)} Xanh
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** One line when every level resolves to the same period, else one entry per level. */
function PeriodNote({ summaries }: { summaries: LevelSummary[] }) {
  const labels = [...new Set(summaries.map((s) => s.periodLabel))];
  if (labels.length <= 1) {
    return <p className="mt-2 text-xs text-slate-500">Kỳ so sánh: {labels[0] ?? "–"}</p>;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {summaries.map((s) => (
        <li key={s.levelId}>
          <span className="font-semibold text-slate-700">{LEVELS[s.levelId].short}:</span> {s.periodLabel}
        </li>
      ))}
    </ul>
  );
}

const TREND_OPTIONS: Array<{ value: TrendMetric; label: string }> = [
  { value: "perClass", label: "TB mỗi lớp" },
  { value: "total", label: "Tổng điểm" },
];

export function SchoolTrendCard({ trend, className }: { trend: (m: TrendMetric) => MergedTrend; className?: string }) {
  const [metric, setMetric] = useState<TrendMetric>("perClass");
  const data = trend(metric);
  const series = useMemo(() => data.series.map((s) => ({ name: s.name, data: s.data, color: s.color })), [data]);

  return (
    <Card
      className={className}
      icon={TrendingUp}
      title="Xu hướng điểm trừ theo tuần"
      subtitle={metric === "perClass" ? "Điểm trừ trung bình mỗi lớp – so sánh được giữa các cấp" : "Tổng điểm trừ của từng cấp học"}
      actions={
        <div data-print-hide>
          <SegmentedControl size="sm" ariaLabel="Cách tính xu hướng" options={TREND_OPTIONS} value={metric} onChange={setMetric} />
        </div>
      }
    >
      <LineChart
        categories={data.categories}
        series={series}
        height={300}
        valueFormatter={(v) => fmtNumber(v, 1)}
        ariaLabel={`Điểm trừ ${metric === "perClass" ? "trung bình mỗi lớp" : ""} theo tuần của ${series.map((s) => s.name).join(", ")}`}
        emptyTitle="Chưa có dữ liệu xu hướng"
      />
    </Card>
  );
}
