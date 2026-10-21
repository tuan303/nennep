"use client";
import { useMemo } from "react";
import { Layers } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { GradeRanking, LevelDataset, Period, RankingRow } from "@/lib/types";
import { gradeSummary, top90DividerIndex } from "./lib/ranking-view";
import { RankingCards } from "./ranking-cards";
import { RankingTable } from "./ranking-table";

export interface GradeSectionProps {
  ds: LevelDataset;
  ranking: GradeRanking;
  period: Period;
  trends: ReadonlyMap<string, number[]>;
  deltas?: ReadonlyMap<string, number>;
  previousNoun: string;
  /** Phone layout (cards + sheet) instead of the table with inline panels. */
  cards: boolean;
  expanded: string | null;
  onToggle: (classCode: string) => void;
  onOpenSheet: (row: RankingRow) => void;
  detailHref: (classCode: string) => string;
  highlightRef: (el: HTMLElement | null) => void;
}

/** One grade: header with the Top 90% cutoff and mini statistics, then the ranking table (or cards on phones). */
export function GradeSection(props: GradeSectionProps) {
  const { ds, ranking, cards } = props;
  const summary = useMemo(() => gradeSummary(ranking), [ranking]);
  const dividerIndex = top90DividerIndex(ranking.rows);
  const ratio = ds.config.top90Ratio;

  return (
    <section id={`khoi-${ranking.grade}`} aria-label={`Khối ${ranking.grade}`} className="scroll-mt-24">
      <Card
        padding="none"
        icon={Layers}
        headingLevel={2}
        title={`Khối ${ranking.grade}`}
        subtitle={
          <span className="num">
            {fmtNumber(summary.classCount)} lớp · Ngưỡng Top {fmtPercent(ratio)}: hạng ≤ {fmtNumber(summary.cutoff)}
          </span>
        }
        actions={
          <dl className="flex flex-wrap items-center gap-2">
            <MiniStat label="Điểm TB" value={fmtNumber(summary.avgScore)} />
            <MiniStat
              label={`Ngoài Top ${fmtPercent(ratio)}`}
              value={`${fmtNumber(summary.outsideCount)} lớp`}
              tone={summary.outsideCount > 0 ? "muted" : "ok"}
            />
            {summary.rag.RED > 0 ? <MiniStat label="Mức Đỏ" value={`${fmtNumber(summary.rag.RED)} lớp`} tone="bad" /> : null}
            {summary.rag.YELLOW > 0 ? <MiniStat label="Mức Vàng" value={`${fmtNumber(summary.rag.YELLOW)} lớp`} tone="warn" /> : null}
          </dl>
        }
      >
        <div className="border-t border-border">
          {cards ? (
            <RankingCards
              grade={ranking.grade}
              rows={ranking.rows}
              dividerIndex={dividerIndex}
              deltas={props.deltas}
              previousNoun={props.previousNoun}
              ratio={ratio}
              onOpen={props.onOpenSheet}
              highlightRef={props.highlightRef}
            />
          ) : (
            <RankingTable
              ds={ds}
              grade={ranking.grade}
              rows={ranking.rows}
              period={props.period}
              dividerIndex={dividerIndex}
              trends={props.trends}
              deltas={props.deltas}
              previousNoun={props.previousNoun}
              expanded={props.expanded}
              onToggle={props.onToggle}
              detailHref={props.detailHref}
              highlightRef={props.highlightRef}
            />
          )}
        </div>
      </Card>
    </section>
  );
}

const TONE = {
  brand: "text-brand-900",
  ok: "text-ok-strong",
  muted: "text-slate-700",
  warn: "text-warn-strong",
  bad: "text-bad-strong",
} as const;

function MiniStat({ label, value, tone = "brand" }: { label: string; value: string; tone?: keyof typeof TONE }) {
  return (
    <div className="flex flex-col rounded-lg bg-surface-2 px-2.5 py-1 ring-1 ring-inset ring-border">
      <dt className="text-2xs font-medium leading-4 text-slate-500">{label}</dt>
      <dd className={cn("num text-sm font-bold leading-5", TONE[tone])}>{value}</dd>
    </div>
  );
}
