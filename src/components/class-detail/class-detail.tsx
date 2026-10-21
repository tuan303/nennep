"use client";
import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { useSession } from "@/lib/client/session";
import { isGvcnOfClass } from "@/lib/constants";
import {
  buildRanking,
  categoryBreakdown,
  classScoreSeries,
  classTimeline,
  filterIncidents,
  findRankingRow,
  kpiComparison,
  periodLabel,
  previousPeriod,
  studentStats,
  topIssues,
  weeklyTrend,
} from "@/lib/engine";
import type { ClassInfo, GlobalFilters, Incident, LevelDataset } from "@/lib/types";
import { previousPeriodNoun } from "../ranking/lib/ranking-view";
import { ClassCharts } from "./class-charts";
import { ClassHeaderCard } from "./class-header-card";
import { ClassKpis } from "./class-kpis";
import { ClassStudents } from "./class-students";
import { ClassTimeline } from "./class-timeline";
import { ClassTopIssues } from "./class-top-issues";
import { classSize, filterTimelineDays, scoreChartData } from "./lib/class-view";

export interface ClassDetailProps {
  ds: LevelDataset;
  cls: ClassInfo;
  filters: GlobalFilters;
  today: string;
}

type Overlay = { kind: "student"; id: string } | { kind: "incident"; incident: Incident } | null;

/** SCR-04 detail of one class: header, KPIs, charts, timeline, frequent errors and students. */
export function ClassDetail({ ds, cls, filters, today }: ClassDetailProps) {
  const { profile, canSeeClass } = useSession();
  const canSee = canSeeClass(ds.levelId, cls.code);
  const hidden = ds.redacted && !canSee;
  const own = isGvcnOfClass(profile, ds.levelId, cls.code);
  const { period, category, errorCode } = filters;
  const code = cls.code;

  const scope = useMemo<GlobalFilters>(() => ({ period, classCode: code, category, errorCode }), [period, code, category, errorCode]);
  const prev = useMemo(() => previousPeriod(period, ds.weeks, ds.config.semesters), [period, ds.weeks, ds.config.semesters]);
  const previousNoun = prev ? previousPeriodNoun(period.mode) : "";

  // Standing in the grade (BR-RANK-06: population = all active classes of the grade; every error counts).
  const row = useMemo(
    () => findRankingRow(buildRanking(ds, period, today, { grade: cls.grade, highlightClass: code }), code),
    [ds, period, today, cls.grade, code],
  );
  const previousRank = useMemo(
    () => (prev ? findRankingRow(buildRanking(ds, prev, today, { grade: cls.grade }), code)?.rank : undefined),
    [ds, prev, today, cls.grade, code],
  );

  const kpis = useMemo(() => kpiComparison(ds, scope), [ds, scope]);
  const trend = useMemo(() => weeklyTrend(ds, scope, today), [ds, scope, today]);
  const series = useMemo(() => classScoreSeries(ds, code, today), [ds, code, today]);
  const chart = useMemo(() => scoreChartData(series), [series]);
  const incidents = useMemo(() => filterIncidents(ds, scope), [ds, scope]);
  const issues = useMemo(() => topIssues(incidents, Number.POSITIVE_INFINITY), [incidents]);
  const categories = useMemo(() => categoryBreakdown(incidents), [incidents]);
  const days = useMemo(() => filterTimelineDays(classTimeline(ds, code, period), { category, errorCode }), [ds, code, period, category, errorCode]);
  const students = useMemo(() => (hidden ? [] : studentStats(ds, scope, today)), [ds, scope, today, hidden]);
  const size = useMemo(() => classSize(ds, cls, canSee), [ds, cls, canSee]);

  const [overlay, setOverlay] = useState<Overlay>(null);
  const periodText = periodLabel(period, ds.config.semesters);
  const issueFilter = !!category || !!errorCode;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ClassHeaderCard
        cls={cls}
        row={row}
        previousRank={previousRank}
        previousNoun={previousNoun}
        size={size}
        period={period}
        config={ds.config}
        hidden={hidden}
        own={own}
      />

      {issueFilter ? (
        <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13px] text-brand-800 ring-1 ring-inset ring-brand-200">
          <Filter aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Đang lọc theo {[category ? `mảng “${category}”` : "", errorCode ? `lỗi ${errorCode}` : ""].filter(Boolean).join(" và ")}: các chỉ số sự
            việc, biểu đồ mảng và dòng thời gian chỉ tính phần được lọc; điểm thi đua và thứ hạng vẫn tính mọi lỗi.
          </span>
        </p>
      ) : null}

      <ClassKpis
        current={kpis.current}
        previous={kpis.previous}
        previousNoun={previousNoun}
        row={row}
        trend={trend}
        scores={chart.score}
        config={ds.config}
        hidden={hidden}
      />

      <ClassCharts classCode={code} chart={chart} baseScorePerWeek={ds.config.baseScorePerWeek} categories={categories} periodText={periodText} />

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-12">
        <ClassTimeline
          className="xl:col-span-7"
          days={days}
          hidden={hidden}
          filtered={issueFilter}
          periodText={periodText}
          onOpenIncident={(incident) => setOverlay({ kind: "incident", incident })}
          onOpenStudent={(id) => setOverlay({ kind: "student", id })}
        />
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 xl:col-span-5">
          <ClassTopIssues issues={issues} />
          <ClassStudents
            classCode={code}
            students={students}
            config={ds.config}
            hidden={hidden}
            relatedStudents={kpis.current.relatedStudents}
            onOpenStudent={(id) => setOverlay({ kind: "student", id })}
          />
        </div>
      </div>

      <StudentHistorySheet
        ds={ds}
        studentId={overlay?.kind === "student" ? overlay.id : null}
        onClose={() => setOverlay(null)}
        period={period}
        onOpenIncident={(incident) => setOverlay({ kind: "incident", incident })}
      />
      <IncidentDetailSheet
        ds={ds}
        incident={overlay?.kind === "incident" ? overlay.incident : null}
        onClose={() => setOverlay(null)}
        onOpenStudent={(id) => setOverlay({ kind: "student", id })}
      />
    </div>
  );
}
