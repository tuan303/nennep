"use client";
import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { RagBadge, Top90Badge, cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { rankingGroupLabel } from "@/lib/engine";
import type { RankingRow } from "@/lib/types";
import { RankDelta, RankMedal } from "./rank-medal";
import { HighlightChip, PenaltyText, RewardText, Top90Divider, scoreTone } from "./ranking-parts";

export interface RankingCardsProps {
  /** Ranking group: the khối, or LEVEL_RANKING_GROUP for a level-wide list. */
  grade: number;
  rows: RankingRow[];
  /** Show lượt vi phạm (the level breaks score ties with it – THPT). */
  showTurns?: boolean;
  dividerIndex: number;
  deltas?: ReadonlyMap<string, number>;
  previousNoun: string;
  /** config.top90Ratio (divider label). */
  ratio: number;
  onOpen: (row: RankingRow) => void;
  highlightRef?: (el: HTMLElement | null) => void;
}

/** Phone layout of a ranking table: one tappable card per class (opens the breakdown sheet). */
export function RankingCards({ grade, rows, showTurns, dividerIndex, deltas, previousNoun, ratio, onOpen, highlightRef }: RankingCardsProps) {
  return (
    <ul role="list" aria-label={`Bảng xếp hạng ${rankingGroupLabel(grade).toLowerCase()}`} className="divide-y divide-border">
      {rows.map((r, idx) => (
        <Fragment key={r.classCode}>
          {idx === dividerIndex ? <Top90Divider as="li" cutoff={r.top90Cutoff} ratio={ratio} /> : null}
          <li ref={r.highlighted ? highlightRef : undefined} className="scroll-mt-28">
            <button
              type="button"
              onClick={() => onOpen(r)}
              aria-label={`Lớp ${r.classCode}, hạng ${r.rank}, ${fmtNumber(r.score)} điểm thi đua${
                showTurns ? `, ${fmtNumber(r.violationTurns)} lượt vi phạm` : ""
              }. Xem phân tích`}
              aria-current={r.highlighted ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500",
                r.highlighted && "bg-star-50 shadow-[inset_0_0_0_2px_var(--color-star-400)]",
              )}
            >
              <span className="flex flex-col items-center gap-1">
                <RankMedal rank={r.rank} />
                {deltas ? <RankDelta delta={deltas.get(r.classCode)} previousNoun={previousNoun} inert /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="num text-base font-bold text-brand-900">{r.classCode}</span>
                  {r.highlighted ? <HighlightChip /> : null}
                </span>
                <span className="truncate text-[13px] text-slate-500">{r.homeroomTeacher ? `GVCN ${r.homeroomTeacher}` : "Chưa có GVCN"}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Top90Badge inTop90={r.inTop90} ratio={ratio} size="sm" />
                  <RagBadge rag={r.rag} compact size="sm" />
                </span>
              </span>
              <span className="num flex shrink-0 flex-col items-end gap-0.5">
                <span className={cn("text-xl font-bold leading-7 tracking-tight", scoreTone(r.score))}>{fmtNumber(r.score)}</span>
                <span className="flex items-center gap-1.5 text-xs">
                  <RewardText value={r.rewardPoints} />
                  <span aria-hidden className="text-slate-300">
                    ·
                  </span>
                  <PenaltyText value={r.penaltyPoints} />
                </span>
                {showTurns ? <span className="text-2xs text-slate-500">{fmtNumber(r.violationTurns)} lượt vi phạm</span> : null}
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-300" strokeWidth={2.25} />
            </button>
          </li>
        </Fragment>
      ))}
    </ul>
  );
}
