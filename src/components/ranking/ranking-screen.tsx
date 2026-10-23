"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChartSpline, ClipboardCheck, FileSpreadsheet, Printer, School, Trophy, type LucideIcon } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, SegmentedControl, Sheet, Switch, useIsMobile } from "@/components/ui";
import { useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import { buildRanking, classScoreSeries, findRankingRow, periodLabel, previousPeriod, rankingGroupLabel, rankingRuleOf } from "@/lib/engine";
import type { LevelDataset } from "@/lib/types";
import { ClassBreakdown } from "./class-breakdown";
import { CoverageView } from "./coverage-view";
import { GradeSection } from "./grade-section";
import { RANKING_VIEWS, parseRankingView, rankingViewDescription, rankingViewHref, type RankingView } from "./lib/movement-view";
import { classDetailHref, periodIncludesCurrentWeek, previousPeriodNoun, rankDeltas, rankingGroupAnchor, trendWindow } from "./lib/ranking-view";
import { RankMovementView } from "./rank-movement-view";
import { RankingExplainer } from "./ranking-explainer";
import { useRankingExport } from "./use-ranking-export";

const VIEW_ICON: Record<RankingView, LucideIcon> = { bang: Trophy, "bien-dong": ChartSpline, "bao-phu": ClipboardCheck };

/**
 * SCR-03 Xếp hạng: competition ranking of the selected level and period (+ REQ_V2 views) – one table per khối, or one
 * table for the whole level when its RankingRule says so (THPT).
 */
export function RankingScreen({ ds }: { ds: LevelDataset }) {
  const { filters } = useFilters();
  const today = useToday();
  const { can } = useSession();
  const cards = useIsMobile();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const pathname = usePathname() ?? "/xep-hang";
  const router = useRouter();
  const view = parseRankingView(searchParams.get("view"));
  const setView = useCallback((v: RankingView) => router.replace(rankingViewHref(pathname, search, v), { scroll: false }), [router, pathname, search]);
  const { period, grade, classCode } = filters;
  const rule = rankingRuleOf(ds.levelId);
  const levelWide = rule.scope === "level";

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

  // A level-wide ranking ignores the grade filter: the whole level is exported (and the file name does not say "Khối").
  const { exporting, exportExcel } = useRankingExport({ ds, grades: ranking.grades, period, today, grade: levelWide ? undefined : grade });
  const label = periodLabel(period, ds.config.semesters);
  const totalClasses = ranking.grades.reduce((n, g) => n + g.rows.length, 0);
  const quiet = ranking.grades.every((g) => g.rows.every((r) => r.incidentCount === 0 && r.rewardPoints === 0));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Trophy}
        eyebrow={`${LEVELS[ds.levelId].short} · ${label}`}
        title="Xếp hạng thi đua"
        description={rankingViewDescription(view, rule.scope)}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
              In
            </Button>
            {view === "bang" && can("excel.export") ? (
              <Button variant="secondary" icon={FileSpreadsheet} loading={exporting} disabled={totalClasses === 0} onClick={() => void exportExcel()}>
                Xuất Excel
              </Button>
            ) : null}
          </>
        }
      />

      <div data-print-hide>
        <SegmentedControl<RankingView>
          ariaLabel="Chế độ xem xếp hạng"
          options={RANKING_VIEWS.map((v) => ({
            value: v.value,
            icon: VIEW_ICON[v.value],
            label: (
              <>
                <span className="sm:hidden">{v.short}</span>
                <span className="max-sm:hidden">{v.label}</span>
              </>
            ),
          }))}
          value={view}
          onChange={setView}
          fullWidth={cards}
          className="max-w-full"
        />
      </div>

      {view === "bao-phu" ? (
        <CoverageView ds={ds} filters={filters} today={today} canManage={can("inspection.manage")} detailHref={detailHref} />
      ) : view === "bien-dong" ? (
        totalClasses === 0 ? (
          <NoClasses />
        ) : (
          <RankMovementView
            key={ds.levelId}
            ds={ds}
            filters={filters}
            today={today}
            grades={ranking.grades.map((g) => g.grade)}
            onOpenClass={(code) => router.push(detailHref(code))}
          />
        )
      ) : (
        <>
          <RankingExplainer
            config={ds.config}
            levelId={ds.levelId}
            gradeFilter={grade}
            period={period}
            countedWeeks={ranking.countedWeeks}
            inProgress={periodIncludesCurrentWeek(period, ds.weeks, today)}
            highlightClass={classCode}
            issueFilterActive={!!filters.category || !!filters.errorCode || !!filters.group || !!filters.studentId}
            quiet={totalClasses > 0 && quiet}
          />

          {totalClasses === 0 ? (
            <NoClasses />
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
        </>
      )}

      <Sheet
        open={!!sheetRow}
        onOpenChange={(open) => !open && setSheetCode(null)}
        title={
          sheetRow ? `Lớp ${sheetRow.classCode} · Hạng ${sheetRow.rank}/${sheetRow.gradeClassCount}${levelWide ? " toàn cấp" : ""}` : "Phân tích lớp"
        }
        description={sheetRow?.homeroomTeacher ? `GVCN ${sheetRow.homeroomTeacher}` : undefined}
        icon={Trophy}
      >
        {sheetRow ? <ClassBreakdown ds={ds} row={sheetRow} period={period} detailHref={detailHref(sheetRow.classCode)} /> : null}
      </Sheet>
    </div>
  );
}

function NoClasses() {
  return (
    <Card padding="none">
      <EmptyState
        icon={School}
        title="Chưa có lớp để xếp hạng"
        description="Cấp học này chưa có lớp đang hoạt động. Quản trị viên có thể thêm lớp trong Cài đặt → Lớp & GVCN."
      />
    </Card>
  );
}

/** Quick-jump between the ranking tables (hidden with a single table, e.g. THPT "Toàn cấp") + compare switch. */
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
              href={`#${rankingGroupAnchor(g)}`}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-surface px-3.5 text-[13px] font-semibold text-brand-800 ring-1 ring-inset ring-border-strong transition-colors hover:bg-brand-50 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:h-11"
            >
              {rankingGroupLabel(g)}
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
