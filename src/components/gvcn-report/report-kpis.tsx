"use client";
import { Award, ClipboardList, Medal, Trophy, TriangleAlert, Users } from "lucide-react";
import { KpiCard, RagBadge, Top90Badge, type KpiDelta } from "@/components/ui";
import { countedRewardHint, countedRewardTerm } from "@/components/rewards/lib/reward-list";
import { fmtNumber, fmtTopLabel } from "@/lib/client/format";
import type { PeriodMode } from "@/lib/types";
import { previousLabelShort, type GvcnReport } from "./lib/report-model";

export interface ReportKpisProps {
  report: GvcnReport;
  periodMode: PeriodMode;
}

/** Sự việc · HS liên quan · Điểm trừ · Điểm thưởng · Điểm thi đua · Hạng khối (+ Top 90%, RAG). */
export function ReportKpis({ report, periodMode }: ReportKpisProps) {
  const { kpis, previous, ranking, classInfo } = report;
  const prevLabel = previousLabelShort(periodMode);
  const delta = (cur: number, prev: number | undefined, goodWhen: KpiDelta["goodWhen"]): KpiDelta | undefined =>
    prev === undefined || !prevLabel ? undefined : { value: cur - prev, goodWhen, label: prevLabel };
  const grade = ranking?.grade ?? classInfo?.grade;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
      <KpiCard label="Sự việc" value={kpis.incidents} icon={ClipboardList} tone="brand" delta={delta(kpis.incidents, previous?.incidents, "down")} />
      <KpiCard
        label="HS liên quan"
        value={kpis.relatedStudents}
        icon={Users}
        tone="muted"
        hint="Tổng số học sinh liên quan trong các sự việc (có tên và chưa rõ tên)."
        delta={delta(kpis.relatedStudents, previous?.relatedStudents, "down")}
        footer={kpis.unnamedStudentCount > 0 ? `${fmtNumber(kpis.unnamedStudentCount)} HS chưa rõ tên` : undefined}
      />
      <KpiCard
        label="Điểm trừ"
        value={kpis.penaltyPoints}
        unit="điểm"
        icon={TriangleAlert}
        tone="bad"
        delta={delta(kpis.penaltyPoints, previous?.penaltyPoints, "down")}
      />
      <KpiCard
        label="Điểm thưởng"
        value={kpis.rewardPoints}
        unit="điểm"
        icon={Award}
        tone="star"
        hint={countedRewardHint({ rewardCountedStatuses: report.countedStatuses })}
        delta={delta(kpis.rewardPoints, previous?.rewardPoints, "up")}
      />
      <KpiCard
        label="Điểm thi đua"
        value={ranking ? ranking.score : "–"}
        icon={Trophy}
        tone="ok"
        hint={`Điểm thi đua = Điểm nền + ${countedRewardTerm({ rewardCountedStatuses: report.countedStatuses })} − Điểm trừ.`}
        footer={
          ranking ? (
            <span className="num">
              Nền {fmtNumber(ranking.base)} + thưởng {fmtNumber(ranking.rewardPoints)} − trừ {fmtNumber(ranking.penaltyPoints)}
            </span>
          ) : (
            "Lớp không tham gia xếp hạng"
          )
        }
      />
      <KpiCard
        label={grade ? `Hạng khối ${grade}` : "Hạng khối"}
        value={ranking ? `${ranking.rank}/${ranking.gradeClassCount}` : "–"}
        icon={Medal}
        tone="star"
        hint="Xếp hạng theo điểm thi đua trong các lớp cùng khối (đồng điểm cùng hạng)."
        footer={
          ranking ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <Top90Badge
                inTop90={ranking.inTop90}
                ratio={report.topRatio}
                size="sm"
                hint={`Hạng ${ranking.rank}/${ranking.gradeClassCount} · ngưỡng ${fmtTopLabel(report.topRatio)}: hạng ${ranking.top90Cutoff}`}
              />
              <RagBadge rag={ranking.rag} reason={ranking.ragReason} compact size="sm" />
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
