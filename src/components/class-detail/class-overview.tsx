"use client";
import { useMemo } from "react";
import { Activity, ClipboardList, Layers, MousePointerClick, School } from "lucide-react";
import { Card, EmptyState, RagBadge, Section, cn } from "@/components/ui";
import { RagLegend } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import { buildRanking, rankingRuleOf } from "@/lib/engine";
import type { GlobalFilters, LevelDataset, Period, RagStatus, RankingRow } from "@/lib/types";
import { CumulativeCard } from "../dashboard/overview/cumulative-card";
import { RankMedal } from "../ranking/rank-medal";
import { overviewSections, rankScopeText } from "./lib/class-view";

const RAG_ACCENT: Record<RagStatus, string> = {
  GREEN: "before:bg-ok",
  YELLOW: "before:bg-warn-fill",
  RED: "before:bg-bad",
  GRAY: "before:bg-slate-300",
};

export interface ClassOverviewProps {
  ds: LevelDataset;
  period: Period;
  grade?: number;
  today: string;
  /** Homeroom classes of the viewer (GVCN) in this level. */
  ownCodes: ReadonlySet<string>;
  onPick: (classCode: string) => void;
  /** Global filters (cumulative penalty by grade honours Mảng / lỗi / nhóm lỗi / học sinh); omitted → period + grade only. */
  filters?: GlobalFilters;
}

/**
 * No class selected: every class of the level as a tile, per ranking table (khối, or "Toàn cấp" for THPT), in ranking
 * order (click → class detail).
 */
export function ClassOverview({ ds, period, grade, today, ownCodes, onPick, filters }: ClassOverviewProps) {
  const ranking = useMemo(() => buildRanking(ds, period, today, { grade }), [ds, period, today, grade]);
  const sections = useMemo(() => overviewSections(ranking.grades, grade), [ranking, grade]);
  const scope = useMemo<GlobalFilters>(() => ({ ...(filters ?? {}), period, grade, classCode: undefined }), [filters, period, grade]);
  // THPT: equal scores are ordered by lượt vi phạm → the tiles show it instead of the number of sự việc.
  const turns = rankingRuleOf(ds.levelId).tieBreak === "violationTurns";
  const rankScope = rankScopeText(ds.levelId);

  if (sections.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={School}
          title="Chưa có lớp đang hoạt động"
          description="Quản trị viên có thể thêm lớp và GVCN trong Cài đặt → Lớp & GVCN."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-card bg-surface/70 px-4 py-3 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[13px] text-slate-600">
          <MousePointerClick aria-hidden className="size-4 shrink-0 text-brand-500" />
          Chọn một lớp để xem chỉ số, thứ hạng, xu hướng và diễn biến theo ngày.
        </p>
        <RagLegend config={ds.config} className="sm:items-end" />
      </div>

      <CumulativeCard ds={ds} filters={scope} today={today} defaultMode="grade" />

      {sections.map((g) => (
        <Section key={g.key} icon={Layers} title={g.title} description={g.description}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {g.rows.map((r) => (
              <li key={r.classCode}>
                <ClassTile row={r} own={ownCodes.has(r.classCode)} turns={turns} rankScope={rankScope} onPick={onPick} />
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

interface ClassTileProps {
  row: RankingRow;
  own: boolean;
  /** Show lượt vi phạm (tie-break of the level) instead of sự việc. */
  turns: boolean;
  /** "trong khối" | "toàn cấp". */
  rankScope: string;
  onPick: (code: string) => void;
}

function ClassTile({ row: r, own, turns, rankScope, onPick }: ClassTileProps) {
  const label =
    `Lớp ${r.classCode}, hạng ${r.rank}/${r.gradeClassCount} ${rankScope}, ${fmtNumber(r.score)} điểm thi đua, ` +
    `${fmtNumber(r.incidentCount)} sự việc, ${fmtNumber(r.violationTurns)} lượt vi phạm`;
  return (
    <button
      type="button"
      onClick={() => onPick(r.classCode)}
      aria-label={label}
      className={cn(
        "card relative flex h-full w-full flex-col gap-2 overflow-hidden p-3.5 pt-4 text-left transition-[box-shadow,transform,border-color] duration-200 ease-soft",
        "before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-['']",
        "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        RAG_ACCENT[r.rag],
        own && "ring-2 ring-star-400",
      )}
    >
      <span className="flex items-center gap-2">
        <RankMedal rank={r.rank} size="sm" />
        <span className="num min-w-0 truncate text-lg font-bold text-brand-900">{r.classCode}</span>
        {own ? <span className="ml-auto shrink-0 rounded bg-star-100 px-1.5 py-0.5 text-2xs font-bold text-star-800">Lớp của tôi</span> : null}
      </span>
      <span className="line-clamp-1 text-xs text-slate-500" title={r.homeroomTeacher}>
        {r.homeroomTeacher ? `GVCN ${r.homeroomTeacher}` : "Chưa có GVCN"}
      </span>
      <span className="num flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold tracking-tight", r.score < 0 ? "text-bad-strong" : "text-brand-900")}>{fmtNumber(r.score)}</span>
        <span className="text-xs text-slate-500">điểm</span>
      </span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-1.5">
        <RagBadge rag={r.rag} compact size="sm" />
        {turns ? (
          <span className="num inline-flex items-center gap-1 text-xs text-slate-500">
            <Activity aria-hidden className="size-3.5" />
            {fmtNumber(r.violationTurns)} lượt vi phạm
          </span>
        ) : (
          <span className="num inline-flex items-center gap-1 text-xs text-slate-500">
            <ClipboardList aria-hidden className="size-3.5" />
            {fmtNumber(r.incidentCount)} sự việc
          </span>
        )}
      </span>
    </button>
  );
}
