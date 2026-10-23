"use client";
/**
 * "Biến động xếp hạng" (REQ_V2 §6.3): one bump chart per ranking group (engine rankHistory) – per khối, or one chart of
 * the whole level (THPT "Toàn cấp") – cumulative or week by week.
 */
import { useCallback, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChartSpline, Waypoints } from "lucide-react";
import { Card, SegmentedControl, Switch, cn } from "@/components/ui";
import { BumpChart } from "@/components/charts";
import { fmtNumber } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import { rankHistory, rankingGroupLabel, rankingRuleOf } from "@/lib/engine";
import type { GlobalFilters, LevelDataset } from "@/lib/types";
import { RANK_BASIS_OPTIONS, bumpHeader, bumpLines, movementLegendText, topMovers, type RankBasis, type RankMove } from "./lib/movement-view";
import { rankingGroupAnchor, rankingRuleNote } from "./lib/ranking-view";

export interface RankMovementViewProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  /** Ranking groups to show (buildRanking grades: khối of the grade filter, or [LEVEL_RANKING_GROUP] for THPT). */
  grades: number[];
  /** Click on a class line → class detail. */
  onOpenClass?: (classCode: string) => void;
}

const BASIS_HINT: Record<RankBasis, string> = {
  cumulative: "Hạng theo điểm thi đua cộng dồn từ đầu kỳ đến từng tuần (tuần cuối = bảng xếp hạng của kỳ).",
  week: "Hạng theo điểm thi đua của riêng từng tuần (điểm nền + thưởng − trừ trong tuần).",
};

export function RankMovementView({ ds, filters, today, grades, onOpenClass }: RankMovementViewProps) {
  const rule = rankingRuleOf(ds.levelId);
  const levelWide = rule.scope === "level";
  const [basis, setBasis] = useState<RankBasis>("cumulative");
  // A level-wide chart has every class of the level (~20 lines): start with the leaders only, the rest one click away.
  const [showOthers, setShowOthers] = useState(!levelWide);
  // The tie-break explains equal scores on the chart; the "Top N" of the reports is the table's business.
  const ruleNote = rankingRuleNote({ ...rule, topCount: undefined }, LEVELS[ds.levelId].short);

  return (
    <div className="flex flex-col gap-5">
      <div data-print-hide className="flex flex-wrap items-center justify-between gap-3">
        {grades.length > 1 ? <GradeNav grades={grades} /> : <span />}
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={showOthers} onChange={setShowOthers} label="Hiện các lớp khác" size="sm" />
          <SegmentedControl size="sm" ariaLabel="Cách tính hạng" options={[...RANK_BASIS_OPTIONS]} value={basis} onChange={setBasis} />
        </div>
      </div>
      <p className="text-[13px] leading-5 text-slate-600">
        {BASIS_HINT[basis]} {movementLegendText({ highlight: filters.classCode, showOthers })}
        {ruleNote ? ` ${ruleNote}` : ""}
        {levelWide && typeof filters.grade === "number" ? ` Bộ lọc Khối ${filters.grade} không thu hẹp xếp hạng toàn cấp.` : ""}
      </p>
      {grades.map((g) => (
        <GradeMovementCard
          key={g}
          ds={ds}
          grade={g}
          basis={basis}
          filters={filters}
          today={today}
          showOthers={showOthers}
          onOpenClass={onOpenClass}
        />
      ))}
    </div>
  );
}

/** Quick-jump between the charts (only rendered with several groups; a level-wide ranking has a single "Toàn cấp"). */
export function GradeNav({ grades }: { grades: number[] }) {
  return (
    <nav aria-label="Chuyển nhanh đến khối" className="no-scrollbar -mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1">
      {grades.map((g) => (
        <a
          key={g}
          href={`#${rankingGroupAnchor(g)}`}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-surface px-3.5 text-[13px] font-semibold text-brand-800 ring-1 ring-inset ring-border-strong transition-colors hover:bg-brand-50 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:h-11"
        >
          {rankingGroupLabel(g)}
        </a>
      ))}
    </nav>
  );
}

interface GradeMovementCardProps {
  ds: LevelDataset;
  /** Ranking group (khối, or LEVEL_RANKING_GROUP – rankHistory then returns every class of the level). */
  grade: number;
  basis: RankBasis;
  filters: GlobalFilters;
  today: string;
  showOthers: boolean;
  onOpenClass?: (classCode: string) => void;
}

export function GradeMovementCard({ ds, grade, basis, filters, today, showOthers, onOpenClass }: GradeMovementCardProps) {
  const history = useMemo(() => rankHistory(ds, grade, today, { basis, period: filters.period }), [ds, grade, today, basis, filters.period]);
  const lines = useMemo(() => bumpLines(history, { highlight: filters.classCode }), [history, filters.classCode]);
  const movers = useMemo(() => topMovers(history), [history]);
  const headerOf = useCallback((i: number) => bumpHeader(basis, history.labels[i] ?? ""), [basis, history.labels]);
  const n = history.classes.length;
  const label = rankingGroupLabel(history.grade);
  const scopeText = label.toLowerCase();

  return (
    <section id={rankingGroupAnchor(history.grade)} aria-label={`Biến động xếp hạng ${scopeText}`} className="scroll-mt-24">
      <Card
        icon={ChartSpline}
        headingLevel={2}
        title={label}
        subtitle={<span className="num">{`${fmtNumber(n)} lớp · ${fmtNumber(history.weeks.length)} tuần tính thi đua`}</span>}
        footer={history.weeks.length > 1 && (movers.up || movers.down) ? <MoversLine up={movers.up} down={movers.down} /> : undefined}
      >
        <BumpChart
          categories={history.labels}
          lines={lines}
          total={n}
          showFaded={showOthers}
          headerOf={headerOf}
          onLineClick={onOpenClass}
          ariaLabel={`Biến động thứ hạng ${n} lớp ${scopeText} qua ${history.weeks.length} tuần. ${lines
            .filter((l) => l.emphasis !== "faded")
            .map((l) => `Lớp ${l.name}: hạng ${l.ranks[l.ranks.length - 1] ?? "–"}`)
            .join(", ")}`}
          emptyTitle="Chưa có tuần nào được tính thi đua"
          emptyDescription="Biểu đồ sẽ hiển thị khi kỳ đang chọn có tuần được tính thi đua."
        />
      </Card>
    </section>
  );
}

function MoversLine({ up, down }: { up?: RankMove; down?: RankMove }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Waypoints aria-hidden className="size-3.5 text-slate-400" />
      {up ? <Mover move={up} dir="up" /> : null}
      {down ? <Mover move={down} dir="down" /> : null}
    </span>
  );
}

function Mover({ move, dir }: { move: RankMove; dir: "up" | "down" }) {
  const Icon = dir === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="num inline-flex items-center gap-1">
      <Icon aria-hidden className={cn("size-3.5", dir === "up" ? "text-ok" : "text-bad")} strokeWidth={2.5} />
      {dir === "up" ? "Tăng hạng nhiều nhất" : "Giảm hạng nhiều nhất"}:{" "}
      <strong className="font-semibold text-brand-900">
        {move.classCode} (#{move.first} → #{move.last})
      </strong>
    </span>
  );
}
