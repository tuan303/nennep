"use client";
import { useMemo } from "react";
import { Target } from "lucide-react";
import { Card, RagBadge, cn } from "@/components/ui";
import { EmptyDataHint } from "@/components/app/widgets";
import type { ClassStat } from "@/lib/engine";
import { fmtNumber, fmtPoints } from "@/lib/client/format";
import type { GradeRanking, LevelDataset } from "@/lib/types";
import { priorityClasses, rankText } from "../lib/overview-model";
import { RowButton } from "../shared/parts";

export interface PriorityClassesCardProps {
  ds: LevelDataset;
  classes: ClassStat[];
  ranking: { grades: GradeRanking[] };
  /** Classes to highlight (GVCN's own). */
  mine?: readonly string[];
  onOpenClass: (classCode: string) => void;
  className?: string;
}

/** "Top 5 lớp cần ưu tiên": classes with the most penalty points in scope, with RAG and rank (khối, or toàn cấp for THPT); click → Khối & lớp. */
export function PriorityClassesCard({ ds, classes, ranking, mine = [], onOpenClass, className }: PriorityClassesCardProps) {
  const top = useMemo(() => priorityClasses(classes, ranking, 5), [classes, ranking]);

  return (
    <Card className={className} icon={Target} title="Top 5 lớp cần ưu tiên" subtitle="Nhiều điểm trừ nhất trong kỳ · bấm để xem chi tiết lớp">
      {top.length === 0 ? (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có lớp phát sinh sự việc trong kỳ này"} />
      ) : (
        <ol className="-mx-2.5 flex flex-col gap-0.5">
          {top.map((c) => {
            const own = mine.includes(c.classCode);
            return (
              <li key={c.classCode}>
                <RowButton
                  onClick={() => onOpenClass(c.classCode)}
                  highlighted={own}
                  label={`Xem lớp ${c.classCode}: ${c.points} điểm trừ, ${c.incidents} sự việc${c.row ? `, ${c.row.ragReason}` : ""}`}
                >
                  <span
                    className={cn(
                      "num inline-flex h-10 min-w-12 shrink-0 items-center justify-center rounded-[10px] px-2 text-sm font-bold ring-1 ring-inset",
                      c.row?.rag === "RED" ? "bg-bad-soft text-bad-strong ring-bad/20" : "bg-brand-50 text-brand-800 ring-brand-600/15",
                    )}
                  >
                    {c.classCode}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[13px] font-medium text-slate-700">{c.homeroomTeacher ? `GVCN ${c.homeroomTeacher}` : "Chưa có GVCN"}</span>
                      {own ? <span className="text-2xs font-semibold uppercase text-star-800">Lớp của tôi</span> : null}
                    </span>
                    <span className="line-clamp-1 text-xs text-slate-500">{c.topIssue ? `Lỗi nhiều nhất: ${c.topIssue}` : "–"}</span>
                    {c.row ? (
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <RagBadge rag={c.row.rag} compact size="sm" />
                        <span className="num text-xs text-slate-500">{rankText(c.row, ds.levelId)}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="num flex shrink-0 flex-col items-end">
                    <span className="text-base font-bold text-bad-strong">{fmtPoints(-c.points)}</span>
                    <span className="text-xs text-slate-500">{fmtNumber(c.incidents)} sự việc</span>
                  </span>
                </RowButton>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
