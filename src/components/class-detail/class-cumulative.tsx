"use client";
/** "Điểm trừ cộng dồn" of a class vs the average of its grade (REQ_V2 §6.4), whole school year by week. */
import { useMemo } from "react";
import { ChartSpline } from "lucide-react";
import { Card, toneHex } from "@/components/ui";
import { EChart } from "@/components/charts";
import { fmtNumber } from "@/lib/client/format";
import { ALL_PERIOD, cumulativePenalty } from "@/lib/engine";
import type { ClassInfo, GlobalFilters, LevelDataset } from "@/lib/types";
import { weekHighlight } from "../dashboard/lib/history-model";
import { buildTrendOption } from "../dashboard/lib/trend-option";
import { classVsGrade, classVsGradeText } from "./lib/class-view";

export interface ClassCumulativeCardProps {
  ds: LevelDataset;
  cls: Pick<ClassInfo, "code" | "grade">;
  filters: GlobalFilters;
  today: string;
  className?: string;
}

const AVG_COLOR = "#94a3b8";

export function ClassCumulativeCard({ ds, cls, filters, today, className }: ClassCumulativeCardProps) {
  const { category, errorCode, group } = filters;
  const cp = useMemo(
    () =>
      cumulativePenalty(ds, { period: ALL_PERIOD, classCode: cls.code, category, errorCode, group }, today, {
        by: "class",
        classCodes: [cls.code],
        gradeAverage: true,
      }),
    [ds, cls.code, category, errorCode, group, today],
  );
  const summary = useMemo(() => classVsGrade(cp, cls.code, cls.grade), [cp, cls.code, cls.grade]);
  const highlight = useMemo(() => weekHighlight(cp.weeks, filters.period, ds.weeks), [cp.weeks, filters.period, ds.weeks]);
  const option = useMemo(
    () =>
      buildTrendOption({
        categories: cp.labels,
        series: cp.series.map((s) =>
          s.key.startsWith("avg:")
            ? { name: s.label, data: s.values, color: AVG_COLOR, dashed: true }
            : { name: s.label, data: s.values, color: toneHex.brand, area: true },
        ),
        highlight,
        headerOf: (i) => `Đến tuần ${cp.labels[i] ?? ""}`,
      }),
    [cp, highlight],
  );
  const compare = classVsGradeText(summary, (n) => fmtNumber(n));
  const hasData = cp.weeks.length > 0 && cp.series.some((s) => s.values.some((v) => v > 0));

  return (
    <Card
      className={className}
      icon={ChartSpline}
      title="Điểm trừ cộng dồn"
      subtitle={`Lớp ${cls.code} so với trung bình khối ${cls.grade} · từ đầu năm học`}
      footer={
        hasData ? (
          <span className="num flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>
              Lớp {cls.code}: <strong className="font-semibold text-brand-900">{fmtNumber(summary.classValue)} điểm</strong>
            </span>
            {summary.avgValue !== undefined ? (
              <span>
                TB khối {cls.grade}: <strong className="font-semibold text-brand-900">{fmtNumber(summary.avgValue)} điểm</strong>
              </span>
            ) : null}
            {compare ? <span className={summary.diff !== undefined && summary.diff > 0 ? "font-semibold text-bad-strong" : "font-semibold text-ok-strong"}>{compare}</span> : null}
          </span>
        ) : undefined
      }
    >
      {hasData ? (
        <EChart
          option={option}
          height={260}
          ariaLabel={`Điểm trừ cộng dồn của lớp ${cls.code}: ${fmtNumber(summary.classValue)} điểm${
            summary.avgValue !== undefined ? `; trung bình khối ${cls.grade}: ${fmtNumber(summary.avgValue)} điểm` : ""
          }`}
        />
      ) : (
        <p className="py-6 text-center text-[13px] text-slate-500">Chưa có điểm trừ từ đầu năm học trong phạm vi đang lọc.</p>
      )}
    </Card>
  );
}
