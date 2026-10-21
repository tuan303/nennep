"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet, Printer, School, Trophy } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Sheet, Switch, useIsMobile } from "@/components/ui";
import { useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import { buildRanking, classScoreSeries, findRankingRow, periodLabel, previousPeriod } from "@/lib/engine";
import type { LevelDataset } from "@/lib/types";
import { ClassBreakdown } from "./class-breakdown";
import { GradeSection } from "./grade-section";
import { classDetailHref, periodIncludesCurrentWeek, previousPeriodNoun, rankDeltas, trendWindow } from "./lib/ranking-view";
import { RankingExplainer } from "./ranking-explainer";
import { useRankingExport } from "./use-ranking-export";

/** SCR-03 Xếp hạng: per-grade competition ranking of the selected level and period. */
export function RankingScreen({ ds }: { ds: LevelDataset }) {
  const { filters } = useFilters();
  const today = useToday();
  const { can } = useSession();
  const cards = useIsMobile();
  const search = useSearchParams().toString();
  const { period, grade, classCode } = filters;

  const ranking = useMemo(() => buildRanking(ds, period, today, { highlightClass: classCode, grade }), [ds, period, today, classCode, grade]);

  // Weekly score series of every active class (independent of the filters), then the window shown by the sparklines.
  const series = useMemo(
    () => new Map(ds.classes.filter((c) => c.active).map((c) => [c.code, classScoreSeries(ds, c.code, today)] as const)),
    [ds, today],
  );
  const trends = useMemo(() => {
    const out = new Map<string, number[]>();
    for (const [code, s] of series) out.set(code, trendWindow(s, period, ds.weeks));
    return out;
  }, [series, period, ds.weeks]);

  const prev = useMemo(() => previousPeriod(period, ds.weeks, ds.config.semesters), [period, ds.weeks, ds.config.semesters]);
  const previousNoun = previousPeriodNoun(period.mode);
  const [compare, setCompare] = useState(false);
  const deltas = useMemo(
    () => (compare && prev ? rankDeltas(ranking.grades, buildRanking(ds, prev, today, { grade }).grades) : undefined),
    [compare, prev, ranking, ds, today, grade],
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const sheetRow = sheetCode ? findRankingRow(ranking, sheetCode) : undefined;
  const toggle = useCallback((code: string) => setExpanded((cur) => (cur === code ? null : code)), []);
  const detailHref = useCallback((code: string) => classDetailHref(search, code), [search]);

  // AC-011: the filtered class keeps its rank; it is only highlighted and scrolled into view.
  const highlightEl = useRef<HTMLElement | null>(null);
  const setHighlightEl = useCallback((el: HTMLElement | null) => {
    highlightEl.current = el;
  }, []);
  useEffect(() => {
    if (!classCode) return;
    const frame = requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      highlightEl.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [classCode, cards]);

  const { exporting, exportExcel } = useRankingExport({ ds, grades: ranking.grades, period, today, grade });
  const label = periodLabel(period, ds.config.semesters);
  const totalClasses = ranking.grades.reduce((n, g) => n + g.rows.length, 0);
  const quiet = ranking.grades.every((g) => g.rows.every((r) => r.incidentCount === 0 && r.rewardPoints === 0));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Trophy}
        eyebrow={`${LEVELS[ds.levelId].short} · ${label}`}
        title="Xếp hạng thi đua"
        description="Bảng xếp hạng theo khối: điểm nền, điểm thưởng, điểm trừ, nhóm Top và mức cảnh báo của từng lớp."
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
              In
            </Button>
            {can("excel.export") ? (
              <Button variant="secondary" icon={FileSpreadsheet} loading={exporting} disabled={totalClasses === 0} onClick={() => void exportExcel()}>
                Xuất Excel
              </Button>
            ) : null}
          </>
        }
      />

      <RankingExplainer
        config={ds.config}
        period={period}
        countedWeeks={ranking.countedWeeks}
        inProgress={periodIncludesCurrentWeek(period, ds.weeks, today)}
        highlightClass={classCode}
        issueFilterActive={!!filters.category || !!filters.errorCode}
        quiet={totalClasses > 0 && quiet}
      />

      {totalClasses === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={School}
            title="Chưa có lớp để xếp hạng"
            description="Cấp học này chưa có lớp đang hoạt động. Quản trị viên có thể thêm lớp trong Cài đặt → Lớp & GVCN."
          />
        </Card>
      ) : (
        <>
          <Toolbar
            grades={ranking.grades.map((g) => g.grade)}
            compare={compare}
            onCompare={setCompare}
            canCompare={!!prev}
            previousText={prev ? `So sánh ${previousNoun}` : "So sánh kỳ trước"}
          />
          {ranking.grades.map((g) => (
            <GradeSection
              key={g.grade}
              ds={ds}
              ranking={g}
              period={period}
              trends={trends}
              deltas={deltas}
              previousNoun={previousNoun}
              cards={cards}
              expanded={expanded}
              onToggle={toggle}
              onOpenSheet={(row) => setSheetCode(row.classCode)}
              detailHref={detailHref}
              highlightRef={setHighlightEl}
            />
          ))}
        </>
      )}

      <Sheet
        open={!!sheetRow}
        onOpenChange={(open) => !open && setSheetCode(null)}
        title={sheetRow ? `Lớp ${sheetRow.classCode} · Hạng ${sheetRow.rank}/${sheetRow.gradeClassCount}` : "Phân tích lớp"}
        description={sheetRow?.homeroomTeacher ? `GVCN ${sheetRow.homeroomTeacher}` : undefined}
        icon={Trophy}
      >
        {sheetRow ? <ClassBreakdown ds={ds} row={sheetRow} period={period} detailHref={detailHref(sheetRow.classCode)} /> : null}
      </Sheet>
    </div>
  );
}

function Toolbar({
  grades,
  compare,
  onCompare,
  canCompare,
  previousText,
}: {
  grades: number[];
  compare: boolean;
  onCompare: (v: boolean) => void;
  canCompare: boolean;
  previousText: string;
}) {
  return (
    <div data-print-hide className="flex flex-wrap items-center justify-between gap-3">
      {grades.length > 1 ? (
        <nav aria-label="Chuyển nhanh đến khối" className="no-scrollbar -mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1">
          {grades.map((g) => (
            <a
              key={g}
              href={`#khoi-${g}`}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-surface px-3.5 text-[13px] font-semibold text-brand-800 ring-1 ring-inset ring-border-strong transition-colors hover:bg-brand-50 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:h-11"
            >
              Khối {g}
            </a>
          ))}
        </nav>
      ) : (
        <span />
      )}
      <Switch
        checked={compare && canCompare}
        onChange={onCompare}
        disabled={!canCompare}
        label={previousText}
        description={canCompare ? undefined : "Không có kỳ trước để so sánh"}
        size="sm"
      />
    </div>
  );
}
