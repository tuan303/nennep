"use client";
import { Award, ClipboardList, ShieldCheck, TriangleAlert, Trophy, Users } from "lucide-react";
import { KpiCard, type KpiDelta } from "@/components/ui";
import { countedRewardHint, countedRewardTerm } from "@/components/rewards/lib/reward-list";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { Kpis, TrendPoint } from "@/lib/engine";
import type { LevelConfig, RankingRow } from "@/lib/types";
import { lastValues } from "./lib/class-view";

export interface ClassKpisProps {
  current: Kpis;
  previous?: Kpis;
  /** "tháng trước"… (empty for the whole year). */
  previousNoun: string;
  row?: RankingRow;
  /** Weekly trend of the class (engine weeklyTrend) for the sparklines. */
  trend: TrendPoint[];
  /** Weekly competition scores (engine classScoreSeries). */
  scores: number[];
  config: LevelConfig;
  /** Names hidden (GVCN, other class). */
  hidden: boolean;
}

function delta(cur: number, prev: number | undefined, goodWhen: "up" | "down", noun: string): KpiDelta | undefined {
  if (prev === undefined || !noun) return undefined;
  return { value: Math.round((cur - prev) * 100) / 100, goodWhen, label: `so với ${noun}` };
}

/** Sự việc, Điểm trừ, Điểm thưởng, Điểm thi đua, HS liên quan, Độ tin cậy of the class in the period. */
export function ClassKpis({ current: c, previous: p, previousNoun, row, trend, scores, config, hidden }: ClassKpisProps) {
  const lowConfidence = c.incidents > 0 && c.confidence < config.rag.minConfidence;
  const confidenceDelta =
    p && previousNoun && c.incidents > 0 && p.incidents > 0
      ? (() => {
          const diff = Math.round((c.confidence - p.confidence) * 1000) / 10;
          return {
            value: diff,
            goodWhen: "up" as const,
            label: `so với ${previousNoun}`,
            display: `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtNumber(Math.abs(diff), 1)} điểm %`,
          };
        })()
      : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 2xl:grid-cols-6">
      <KpiCard
        label="Sự việc"
        value={c.incidents}
        icon={ClipboardList}
        tone="brand"
        delta={delta(c.incidents, p?.incidents, "down", previousNoun)}
        sparkline={lastValues(trend.map((t) => t.incidents))}
      />
      <KpiCard
        label="Điểm trừ"
        value={c.penaltyPoints}
        unit="điểm"
        icon={TriangleAlert}
        tone="bad"
        delta={delta(c.penaltyPoints, p?.penaltyPoints, "down", previousNoun)}
        sparkline={lastValues(trend.map((t) => t.points))}
      />
      <KpiCard
        label="Điểm thưởng"
        value={c.rewardPoints}
        unit="điểm"
        icon={Award}
        tone="star"
        hint={countedRewardHint(config)}
        delta={delta(c.rewardPoints, p?.rewardPoints, "up", previousNoun)}
        sparkline={lastValues(trend.map((t) => t.rewards))}
      />
      <KpiCard
        label="Điểm thi đua"
        value={row ? fmtNumber(row.score) : "–"}
        icon={Trophy}
        tone="ok"
        hint={`Điểm thi đua = Điểm nền + ${countedRewardTerm(config)} − Điểm trừ, tính mọi lỗi trong kỳ.`}
        sparkline={lastValues(scores)}
        footer={row ? `Hạng ${fmtNumber(row.rank)}/${fmtNumber(row.gradeClassCount)} · điểm nền ${fmtNumber(row.base)}` : "Không xếp hạng"}
      />
      <KpiCard
        label="Học sinh liên quan"
        value={c.relatedStudents}
        icon={Users}
        tone="muted"
        hint="Tổng lượt học sinh trong các sự việc (gồm cả học sinh chưa rõ tên)."
        delta={delta(c.relatedStudents, p?.relatedStudents, "down", previousNoun)}
        footer={
          hidden
            ? "Tên học sinh được ẩn"
            : `${fmtNumber(c.uniqueStudents)} HS có tên${c.unnamedStudentCount > 0 ? ` · ${fmtNumber(c.unnamedStudentCount)} chưa rõ tên` : ""}`
        }
      />
      <KpiCard
        label="Độ tin cậy dữ liệu"
        value={fmtPercent(c.confidence)}
        icon={ShieldCheck}
        tone={lowConfidence ? "warn" : "ok"}
        hint="(Hợp lệ + Thiếu tên HS) / tổng sự việc của lớp trong kỳ."
        delta={confidenceDelta}
        footer={
          c.reviewCount > 0
            ? `${fmtNumber(c.reviewCount)} sự việc Cần rà soát`
            : c.incidents > 0
              ? "Không có sự việc cần rà soát"
              : "Chưa có sự việc trong kỳ"
        }
      />
    </div>
  );
}
