"use client";
import { useMemo } from "react";
import { Layers, Trophy } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { namedTop, rankingGroupLabel, rankingRuleOf } from "@/lib/engine";
import type { GradeRanking, LevelDataset, Period, RankingRow } from "@/lib/types";
import { gradeSummary, rankingGroupAnchor, rankingLeaders, top90DividerIndex } from "./lib/ranking-view";
import { RankMedal } from "./rank-medal";
import { RankingCards } from "./ranking-cards";
import { RankingTable } from "./ranking-table";

/** Leader chips shown before "và N lớp đồng hạng khác" (a tie at the cut can swallow many classes). */
const MAX_LEADER_CHIPS = 6;

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

/**
 * One ranking table – a khối, or the whole level (THPT "Toàn cấp"): header with the Top 90% cutoff and mini statistics,
 * the classes named by the reports (RankingRule.topCount), then the ranking table (or cards on phones).
 */
export function GradeSection(props: GradeSectionProps) {
  const { ds, ranking, cards } = props;
  const summary = useMemo(() => gradeSummary(ranking), [ranking]);
  const rule = rankingRuleOf(ds.levelId);
  const leaders = useMemo(() => rankingLeaders(ranking.rows, rule), [ranking.rows, rule]);
  const allTied = useMemo(() => namedTop(ranking.rows, rule.topCount).allTied, [ranking.rows, rule.topCount]);
  const dividerIndex = top90DividerIndex(ranking.rows);
  const ratio = ds.config.top90Ratio;
  const label = rankingGroupLabel(ranking.grade);
  const showTurns = rule.tieBreak === "violationTurns";

  return (
    <section id={rankingGroupAnchor(ranking.grade)} aria-label={label} className="scroll-mt-24">
      <Card
        padding="none"
        icon={Layers}
        headingLevel={2}
        title={label}
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
        {rule.topCount && leaders.length > 0 ? (
          <LeadersStrip rows={leaders} title={`Top ${fmtNumber(rule.topCount)} ${label.toLowerCase()}`} showTurns={showTurns} />
        ) : rule.topCount && allTied ? (
          <p className="border-t border-border px-4 py-2.5 text-[13px] text-slate-600">
            Top {fmtNumber(rule.topCount)} {label.toLowerCase()}: tất cả {fmtNumber(ranking.rows.length)} lớp đồng hạng 1 ({fmtNumber(ranking.rows[0]?.score ?? 0)} điểm).
          </p>
        ) : null}
        <div className="border-t border-border">
          {cards ? (
            <RankingCards
              grade={ranking.grade}
              rows={ranking.rows}
              showTurns={showTurns}
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

/** "Top 3 toàn cấp": the leading classes with score (and lượt vi phạm, the tie-break) – ties share a medal. */
function LeadersStrip({ rows, title, showTurns }: { rows: RankingRow[]; title: string; showTurns: boolean }) {
  const shown = rows.slice(0, MAX_LEADER_CHIPS);
  const hidden = rows.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-star-50/50 px-4 py-2.5 sm:px-5">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-star-900">
        <Trophy aria-hidden className="size-3.5 text-star-600" strokeWidth={2.25} />
        {title}
      </span>
      <ul role="list" aria-label={title} className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shown.map((r) => (
          <li
            key={r.classCode}
            className="num inline-flex items-center gap-1.5 rounded-full bg-surface py-0.5 pl-0.5 pr-2.5 text-[13px] ring-1 ring-inset ring-border"
          >
            <RankMedal rank={r.rank} size="sm" />
            <span className="font-bold text-brand-900">{r.classCode}</span>
            <span className="text-slate-500">
              {fmtNumber(r.score)} điểm{showTurns ? ` · ${fmtNumber(r.violationTurns)} lượt vi phạm` : ""}
            </span>
          </li>
        ))}
        {hidden > 0 ? <li className="num text-xs text-slate-500">và {fmtNumber(hidden)} lớp đồng hạng khác</li> : null}
      </ul>
    </div>
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
