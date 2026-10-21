"use client";
/**
 * "Tổng quan" (SCR-02): the BGH dashboard of the selected level. Every widget reacts to the global filters (URL);
 * clicking a chart element narrows the filters (week, error, Mảng, grade, class) or drills down (Khối & lớp, history).
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { FILTER_PARAMS, useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { periodLabel } from "@/lib/engine";
import type { Incident, LevelDataset } from "@/lib/types";
import { selectedGroup } from "../lib/history-model";
import { myClassRows, selectedCategory } from "../lib/overview-model";
import { hrefWithParams } from "../lib/view-helpers";
import { CumulativeCard } from "./cumulative-card";
import { CategoryCard, WeekdayCard } from "./distribution-cards";
import { EarlyWarningCard } from "./early-warning-card";
import { FiveSCard } from "./five-s-card";
import { GradeCard } from "./grade-card";
import { GroupCard } from "./group-card";
import { HeatmapCard } from "./heatmap-card";
import { InsightsCard } from "./insights-card";
import { KpiRow } from "./kpi-row";
import { MyClassCard } from "./my-class-card";
import { OverviewHeader, RagApprovalNotice } from "./overview-header";
import { PriorityClassesCard } from "./priority-classes-card";
import { RagCard } from "./rag-card";
import { RecidivismCard } from "./recidivism-card";
import { TopIssuesCard } from "./top-issues-card";
import { TopStudentsCard } from "./top-students-card";
import { TrendCard } from "./trend-card";
import { useOverviewData } from "./use-overview-data";

const ROW = "grid grid-cols-1 gap-4 sm:gap-5";

export function OverviewScreen({ ds }: { ds: LevelDataset }) {
  const { filters, setFilters, options } = useFilters();
  const today = useToday();
  const { can, profile } = useSession();
  const router = useRouter();
  const search = useSearchParams().toString();
  const data = useOverviewData(ds, filters, today);

  const [studentId, setStudentId] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);

  const mine = useMemo(() => myClassRows(profile, ds.levelId, data.ranking), [profile, ds.levelId, data.ranking]);
  const mineCodes = useMemo(() => mine.map((r) => r.classCode), [mine]);

  const openClass = useCallback(
    (classCode: string) => router.push(hrefWithParams("/lop", search, { [FILTER_PARAMS.classCode]: classCode })),
    [router, search],
  );
  const pickWeek = useCallback((key: string) => setFilters({ period: { mode: "week", key } }), [setFilters]);
  const pickCell = useCallback(
    (classCode: string, key: string) => setFilters({ classCode, period: { mode: "week", key } }),
    [setFilters],
  );
  const openStudent = useCallback((id: string) => setStudentId(id), []);

  // Keep the global filters so /du-lieu shows the same scope as the tile; open its data-quality tab.
  const kpiDrill = useMemo(
    () => (can("data.inspect") ? { confidence: () => router.push(hrefWithParams("/du-lieu", search, { tab: "chat-luong" })) } : undefined),
    [can, router, search],
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <OverviewHeader ds={ds} period={filters.period} search={search} canCreate={can("incident.create")} />

      {!ds.config.rag.approved ? <RagApprovalNotice canManage={can("settings.manage")} /> : null}

      <MyClassCard rows={mine} periodText={periodLabel(filters.period, ds.config.semesters)} topRatio={ds.config.top90Ratio} onOpenClass={openClass} />

      <KpiRow views={data.kpis} onOpen={kpiDrill} />

      <div className={`${ROW} xl:grid-cols-12`}>
        <InsightsCard ds={ds} period={filters.period} today={today} canOpenActions={can("actions.view")} compact className="xl:col-span-7" />
        <EarlyWarningCard
          ds={ds}
          filters={filters}
          today={today}
          profile={profile}
          canOpenActions={can("actions.view")}
          search={search}
          onOpenClass={openClass}
          onOpenStudent={openStudent}
          onOpenIncident={setIncident}
          className="xl:col-span-5"
        />
      </div>

      <div className={`${ROW} xl:grid-cols-12`}>
        <TrendCard ds={ds} trend={data.trend} period={filters.period} onPickWeek={pickWeek} className="xl:col-span-8" />
        <RagCard ds={ds} ranking={data.ranking} grade={filters.grade} onOpenClass={openClass} className="xl:col-span-4" />
      </div>

      <div className={`${ROW} xl:grid-cols-12`}>
        <GroupCard
          ds={ds}
          incidents={data.byGroup}
          group={filters.group}
          highlighted={selectedGroup(filters, ds.catalog)}
          onPick={(group) => setFilters({ group })}
          className="xl:col-span-5"
        />
        <CumulativeCard ds={ds} filters={filters} today={today} onPickWeek={pickWeek} className="xl:col-span-7" />
      </div>

      <div className={`${ROW} md:grid-cols-2 xl:grid-cols-12`}>
        <TopIssuesCard
          ds={ds}
          incidents={data.byError}
          errorCode={filters.errorCode}
          onPick={(errorCode) => setFilters({ errorCode })}
          className="xl:col-span-4"
        />
        <PriorityClassesCard
          ds={ds}
          classes={data.classes}
          ranking={data.ranking}
          mine={mineCodes}
          onOpenClass={openClass}
          className="xl:col-span-4"
        />
        <TopStudentsCard
          ds={ds}
          filters={filters}
          today={today}
          search={search}
          onOpenStudent={openStudent}
          className="md:col-span-2 xl:col-span-4"
        />
      </div>

      <div className={`${ROW} md:grid-cols-2 xl:grid-cols-12`}>
        <GradeCard ds={ds} filters={filters} today={today} onPickGrade={(grade) => setFilters({ grade })} className="md:col-span-2 xl:col-span-5" />
        <CategoryCard
          ds={ds}
          incidents={data.byCategory}
          categoryOrder={options.categories}
          category={filters.category}
          highlighted={selectedCategory(filters, ds.catalog)}
          onPick={(category) => setFilters({ category })}
          className="xl:col-span-4"
        />
        <WeekdayCard ds={ds} incidents={data.filtered} className="xl:col-span-3" />
      </div>

      <HeatmapCard ds={ds} filters={filters} today={today} context={data.context} onPickCell={pickCell} />

      <div className={`${ROW} lg:grid-cols-2`}>
        <FiveSCard
          ds={ds}
          filters={filters}
          today={today}
          totalPenalty={data.current.penaltyPoints}
          context={data.context}
          onOpenClass={openClass}
        />
        <RecidivismCard
          ds={ds}
          filters={filters}
          today={today}
          context={data.context}
          onOpenClass={openClass}
          onOpenStudent={openStudent}
        />
      </div>

      <StudentHistorySheet
        ds={ds}
        studentId={studentId}
        onClose={() => setStudentId(null)}
        period={filters.period}
        onOpenIncident={(i) => {
          setStudentId(null);
          setIncident(i);
        }}
      />
      <IncidentDetailSheet
        ds={ds}
        incident={incident}
        onClose={() => setIncident(null)}
        onOpenStudent={(id) => {
          setIncident(null);
          setStudentId(id);
        }}
      />
    </div>
  );
}
