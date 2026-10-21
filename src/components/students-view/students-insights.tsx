"use client";
import { useMemo } from "react";
import { ChartColumnBig } from "lucide-react";
import { BarChart } from "@/components/charts";
import { Card, Section, toneHex } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { StudentStat } from "@/lib/engine";
import { INCIDENT_BUCKETS, incidentDistribution, multiIncidentShare, topStudentsChart } from "./lib/students-model";

const BUCKETS = [...INCIDENT_BUCKETS];
const countFormatter = (v: number) => fmtNumber(v);

export interface StudentsInsightsProps {
  /** Students of the page scope (global filters only – the table toolbar does not apply). */
  stats: StudentStat[];
  onOpen: (studentId: string) => void;
}

/** "Lỗi theo học sinh": top 10 students by incidents (drill → history) and the 1 / 2 / 3 / 4+ distribution. */
export function StudentsInsights({ stats, onOpen }: StudentsInsightsProps) {
  const top = useMemo(() => topStudentsChart(stats, 10), [stats]);
  const dist = useMemo(() => incidentDistribution(stats), [stats]);
  const topSeries = useMemo(() => [{ name: "Số lượt", data: top.incidents, color: toneHex.bad }], [top]);
  const distSeries = useMemo(() => [{ name: "Số học sinh", data: dist, color: toneHex.brand }], [dist]);
  const share = multiIncidentShare(dist);
  const repeaters = dist[1] + dist[2] + dist[3];

  return (
    <Section icon={ChartColumnBig} title="Lỗi theo học sinh" description="Theo bộ lọc chung của trang (không áp dụng ô tìm kiếm và lọc của danh sách).">
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Top 10 học sinh nhiều lượt vi phạm nhất" subtitle="Bấm vào một cột để xem lịch sử của học sinh">
          <BarChart
            horizontal
            categories={top.categories}
            series={topSeries}
            showValues
            valueFormatter={countFormatter}
            onBarClick={(e) => {
              const id = top.ids[e.index];
              if (id) onOpen(id);
            }}
            ariaLabel="Biểu đồ cột ngang: 10 học sinh có nhiều lượt vi phạm nhất"
            emptyTitle="Chưa có học sinh vi phạm"
            emptyDescription="Không có học sinh nào được ghi tên trong phạm vi đang lọc."
          />
        </Card>
        <Card className="lg:col-span-5" title="Phân bố theo số lượt vi phạm" subtitle="Số học sinh có 1, 2, 3 và từ 4 lượt trở lên">
          <BarChart
            categories={BUCKETS}
            series={distSeries}
            showValues
            height={240}
            valueFormatter={countFormatter}
            ariaLabel="Biểu đồ cột: số học sinh theo số lượt vi phạm"
            emptyTitle="Chưa có học sinh vi phạm"
          />
          {stats.length > 0 ? (
            <p className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-[13px] leading-5 text-slate-700 ring-1 ring-inset ring-border">
              <strong className="num text-brand-900">{fmtPercent(share)}</strong> học sinh vi phạm có từ 2 lượt trở lên (
              <span className="num">{fmtNumber(repeaters)}</span>/<span className="num">{fmtNumber(stats.length)}</span> em) – nhóm cần GVCN theo dõi sát.
            </p>
          ) : null}
        </Card>
      </div>
    </Section>
  );
}
