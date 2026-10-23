"use client";
import { Award, ClipboardList, Medal, Repeat, Trophy, TriangleAlert, UserRound } from "lucide-react";
import { KpiCard, RagBadge, Top90Badge, type KpiDelta } from "@/components/ui";
import { countedRewardHint, countedRewardTerm } from "@/components/rewards/lib/reward-list";
import { fmtNumber, fmtTopLabel } from "@/lib/client/format";
import { KPI_TERMS } from "@/lib/constants";
import type { PeriodMode } from "@/lib/types";
import { previousLabelShort, type GvcnReport } from "./lib/report-model";

export interface ReportKpisProps {
  report: GvcnReport;
  periodMode: PeriodMode;
}

/**
 * Sự việc · Lượt vi phạm · Số HS vi phạm · Điểm trừ (shared KPI_TERMS labels / tooltips) · Điểm thưởng · Điểm thi đua ·
 * Hạng khối – Hạng toàn cấp for THPT – (+ Top 90%, RAG).
 */
export function ReportKpis({ report, periodMode }: ReportKpisProps) {
  const { kpis, previous, ranking } = report;
  const prevLabel = previousLabelShort(periodMode);
  const delta = (cur: number, prev: number | undefined, goodWhen: KpiDelta["goodWhen"]): KpiDelta | undefined =>
    prev === undefined || !prevLabel ? undefined : { value: cur - prev, goodWhen, label: prevLabel };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 2xl:grid-cols-7">
      <KpiCard
        label={KPI_TERMS.incidents.label}
        value={kpis.incidents}
        icon={ClipboardList}
        tone="brand"
        hint={KPI_TERMS.incidents.hint}
        delta={delta(kpis.incidents, previous?.incidents, "down")}
      />
      <KpiCard
        label={KPI_TERMS.violationTurns.label}
        value={kpis.violationTurns}
        icon={Repeat}
        tone="muted"
        hint={KPI_TERMS.violationTurns.hint}
        delta={delta(kpis.violationTurns, previous?.violationTurns, "down")}
      />
      <KpiCard
        label={KPI_TERMS.uniqueStudents.label}
        value={kpis.uniqueStudents}
        icon={UserRound}
        tone="muted"
        hint={KPI_TERMS.uniqueStudents.hint}
        delta={delta(kpis.uniqueStudents, previous?.uniqueStudents, "down")}
        footer={
          kpis.unnamedStudentCount > 0
            ? `+ ${fmtNumber(kpis.unnamedStudentCount)} HS chưa rõ tên · ${fmtNumber(kpis.relatedStudents)} ${KPI_TERMS.relatedStudents.label}`
            : `${fmtNumber(kpis.relatedStudents)} ${KPI_TERMS.relatedStudents.label}`
        }
      />
      <KpiCard
        label={KPI_TERMS.penaltyPoints.label}
        value={kpis.penaltyPoints}
        unit="điểm"
        icon={TriangleAlert}
        tone="bad"
        hint={KPI_TERMS.penaltyPoints.hint}
        delta={delta(kpis.penaltyPoints, previous?.penaltyPoints, "down")}
      />
      <KpiCard
        label={KPI_TERMS.rewardPoints.label}
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
        label={report.rankLabel}
        value={ranking ? `${ranking.rank}/${ranking.gradeClassCount}` : "–"}
        icon={Medal}
        tone="star"
        hint={report.rankHint}
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
