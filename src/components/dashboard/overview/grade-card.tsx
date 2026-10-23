"use client";
import { useMemo } from "react";
import { FilterX, Layers, Star } from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { gradeStats, LEVEL_RANKING_GROUP, rankingRuleOf, type GradeStat } from "@/lib/engine";
import { fmtNumber, fmtPoints, fmtTopLabel } from "@/lib/client/format";
import type { GlobalFilters, LevelDataset } from "@/lib/types";
import { rankingGroupText } from "../lib/overview-model";
import { share } from "../lib/view-helpers";
import { RowButton } from "../shared/parts";

export interface GradeCardProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  onPickGrade: (grade: number | undefined) => void;
  className?: string;
}

function rowLabel(g: GradeStat, active: boolean, topLabel: string): string {
  return (
    `${active ? "Bỏ lọc" : "Lọc theo"} khối ${g.grade}: ${g.classCount} lớp, ${g.incidents} sự việc, ${g.penaltyPoints} điểm trừ, ` +
    `${g.rewardPoints} điểm thưởng, điểm thi đua trung bình ${g.avgScore}, ${g.top90Count}/${g.classCount} lớp thuộc ${topLabel}`
  );
}

/**
 * "Theo khối": per-grade statistics (engine gradeStats) as a compact list that never scrolls sideways; click → grade filter.
 * The Top 90% of a level ranked as a whole (THPT) is computed over the level: labelled "Top 90% toàn cấp".
 */
export function GradeCard({ ds, filters, today, onPickGrade, className }: GradeCardProps) {
  const grades = useMemo(() => gradeStats(ds, filters, today), [ds, filters, today]);
  const top = fmtTopLabel(ds.config.top90Ratio);
  const topLabel = rankingRuleOf(ds.levelId).scope === "level" ? `${top} ${rankingGroupText(ds.levelId, LEVEL_RANKING_GROUP)}` : top;
  const maxPenalty = Math.max(0, ...grades.map((g) => g.penaltyPoints));

  return (
    <Card
      className={className}
      icon={Layers}
      title="Theo khối"
      subtitle="Bấm vào một khối để lọc cả trang"
      actions={
        typeof filters.grade === "number" ? (
          <Button variant="ghost" size="sm" icon={FilterX} onClick={() => onPickGrade(undefined)} data-print-hide>
            Tất cả khối
          </Button>
        ) : undefined
      }
    >
      {grades.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-500">Chưa có lớp đang hoạt động.</p>
      ) : (
        <ul className="-mx-2.5 flex flex-col gap-1">
          {grades.map((g) => (
            <li key={g.grade}>
              <RowButton
                onClick={() => onPickGrade(filters.grade === g.grade ? undefined : g.grade)}
                highlighted={filters.grade === g.grade}
                label={rowLabel(g, filters.grade === g.grade, topLabel)}
                className="py-2.5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px] font-bold text-brand-900">Khối {g.grade}</span>
                      <span className="num text-xs text-slate-500">{fmtNumber(g.classCount)} lớp</span>
                    </span>
                    <span className="num text-xs text-slate-500">
                      Thi đua TB <b className="text-[15px] text-brand-900">{fmtNumber(g.avgScore, 1)}</b>
                    </span>
                  </span>
                  <span className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>
                      <b className="text-brand-900">{fmtNumber(g.incidents)}</b> sự việc
                    </span>
                    <span>
                      <b className="text-bad-strong">{fmtPoints(-g.penaltyPoints)}</b> điểm trừ
                    </span>
                    <span>
                      <b className="text-star-800">{fmtPoints(g.rewardPoints)}</b> điểm thưởng
                    </span>
                    <span>
                      <b className="text-brand-900">{fmtNumber(g.studentsInvolved)}</b> HS có tên
                    </span>
                  </span>
                  <span className="grid grid-cols-2 items-center gap-3">
                    <ProgressBar value={share(g.penaltyPoints, maxPenalty)} tone="bad" size="sm" ariaLabel={`Điểm trừ khối ${g.grade}`} />
                    <span className="flex items-center gap-2">
                      <ProgressBar value={share(g.top90Count, g.classCount)} tone="star" size="sm" ariaLabel={`Số lớp khối ${g.grade} thuộc ${topLabel}`} className="flex-1" />
                      <span className="num inline-flex shrink-0 items-center gap-1 text-xs text-slate-600">
                        <Star aria-hidden className="size-3 fill-star-500 text-star-600" />
                        {fmtNumber(g.top90Count)}/{fmtNumber(g.classCount)}
                      </span>
                    </span>
                  </span>
                </span>
              </RowButton>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-4 rounded-full bg-bad" /> Điểm trừ so với khối cao nhất
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-4 rounded-full bg-star-500" /> Số lớp thuộc {topLabel}
        </span>
      </p>
    </Card>
  );
}
