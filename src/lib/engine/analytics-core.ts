/** KPIs, issue / class / grade / category / weekday aggregates. Re-exported by analytics.ts. */
import type { GlobalFilters, Incident, LevelDataset, Unit } from "../types";
import { addDays, isIsoDate, weekdayIndex, weekdayLabelVN } from "./dates";
import { countedRewards, filterIncidents, filterRewards } from "./filters";
import { periodLabel, previousPeriod } from "./period";
import { dataConfidence } from "./rag";
import { buildRanking } from "./ranking";
import { round2 } from "./scoring";
import { compareVN, naturalCompare } from "./text";
import { compareClassInfo, groupBy, sumBy, uniqueCount } from "./utils";

export interface Kpis {
  incidents: number;
  relatedStudents: number;
  uniqueStudents: number;
  penaltyPoints: number;
  rewardPoints: number;
  classesWithIncidents: number;
  confidence: number;
  reviewCount: number;
  unnamedStudentCount: number;
}

/**
 * KPIs of the filtered scope. relatedStudents = Σ relatedStudentCount (named + unnamed);
 * uniqueStudents = distinct named students; rewardPoints = counted rewards (period + grade + class only).
 */
export function computeKpis(ds: LevelDataset, f: GlobalFilters): Kpis {
  const inc = filterIncidents(ds, f);
  const rewards = countedRewards(filterRewards(ds, f), ds.config);
  return {
    incidents: inc.length,
    relatedStudents: sumBy(inc, (i) => i.relatedStudentCount),
    uniqueStudents: uniqueCount(inc.flatMap((i) => i.students.map((s) => s.id))),
    penaltyPoints: sumBy(inc, (i) => i.points),
    rewardPoints: sumBy(rewards, (r) => r.points),
    classesWithIncidents: uniqueCount(inc.map((i) => i.classCode)),
    confidence: dataConfidence(inc),
    reviewCount: inc.filter((i) => i.dataCheck === "REVIEW").length,
    unnamedStudentCount: sumBy(inc, (i) => i.unnamedCount),
  };
}

/** KPIs of the current filters and of the previous period (same other filters). `previous` is undefined for "all" / first period. */
export function kpiComparison(ds: LevelDataset, f: GlobalFilters): { current: Kpis; previous?: Kpis; previousLabel?: string } {
  const current = computeKpis(ds, f);
  const prev = previousPeriod(f.period, ds.weeks, ds.config.semesters);
  if (!prev) return { current };
  return {
    current,
    previous: computeKpis(ds, { ...f, period: prev }),
    previousLabel: periodLabel(prev, ds.config.semesters),
  };
}

export interface IssueStat {
  errorCode: string;
  issue: string;
  category: string;
  unit: Unit;
  incidents: number;
  points: number;
  students: number;
  classCount: number;
}

/**
 * Most frequent errors: incidents desc, points desc, then error code. `students` = Σ relatedStudentCount.
 * `n` defaults to 5 – pass `Infinity` for all.
 */
export function topIssues(incidents: Incident[], n = 5): IssueStat[] {
  const stats = [...groupBy(incidents, (i) => i.errorCode).entries()].map(([errorCode, list]): IssueStat => {
    const first = list[0];
    return {
      errorCode,
      issue: first.issue,
      category: first.category,
      unit: first.unit,
      incidents: list.length,
      points: sumBy(list, (i) => i.points),
      students: sumBy(list, (i) => i.relatedStudentCount),
      classCount: uniqueCount(list.map((i) => i.classCode)),
    };
  });
  stats.sort((a, b) => b.incidents - a.incidents || b.points - a.points || naturalCompare(a.errorCode, b.errorCode));
  return stats.slice(0, Math.max(0, n));
}

export interface ClassStat {
  classCode: string;
  grade: number;
  homeroomTeacher?: string;
  incidents: number;
  points: number;
  students: number;
  topIssue?: string;
}

/** Every ACTIVE class in scope (grade/class filters), zeros included; points desc, incidents desc, class code. */
export function classStats(ds: LevelDataset, f: GlobalFilters): ClassStat[] {
  const byClass = groupBy(filterIncidents(ds, f), (i) => i.classCode);
  const hasGrade = typeof f.grade === "number";
  const stats = ds.classes
    .filter((c) => c.active && (!hasGrade || c.grade === f.grade) && (!f.classCode || c.code === f.classCode))
    .map((c): ClassStat => {
      const list = byClass.get(c.code) ?? [];
      const stat: ClassStat = {
        classCode: c.code,
        grade: c.grade,
        incidents: list.length,
        points: sumBy(list, (i) => i.points),
        students: sumBy(list, (i) => i.relatedStudentCount),
      };
      if (c.homeroomTeacher) stat.homeroomTeacher = c.homeroomTeacher;
      const top = topIssues(list, 1)[0];
      if (top) stat.topIssue = top.issue;
      return stat;
    });
  return stats.sort((a, b) => b.points - a.points || b.incidents - a.incidents || naturalCompare(a.classCode, b.classCode));
}

export interface GradeStat {
  grade: number;
  classCount: number;
  incidents: number;
  penaltyPoints: number;
  rewardPoints: number;
  avgScore: number;
  studentsInvolved: number;
  top90Count: number;
}

/**
 * Per-grade statistics over the whole grade population. Honours period, grade, category and error filters;
 * a class filter only restricts the output to that class's grade. studentsInvolved = distinct named students.
 * avgScore / top90Count come from `buildRanking` (scores always include every error).
 */
export function gradeStats(ds: LevelDataset, f: GlobalFilters, today: string): GradeStat[] {
  const active = ds.classes.filter((c) => c.active).sort(compareClassInfo);
  let grades = [...new Set(active.map((c) => c.grade))];
  if (typeof f.grade === "number") grades = grades.filter((g) => g === f.grade);
  const filteredClass = f.classCode ? ds.classes.find((c) => c.code === f.classCode) : undefined;
  if (filteredClass) grades = grades.filter((g) => g === filteredClass.grade);

  const scope: GlobalFilters = { ...f, classCode: undefined };
  const incByGrade = groupBy(filterIncidents(ds, scope), (i) => String(i.grade));
  const rewByGrade = groupBy(countedRewards(filterRewards(ds, scope), ds.config), (r) => String(r.grade));
  const ranking = buildRanking(ds, f.period, today);

  return grades.map((grade) => {
    const inc = incByGrade.get(String(grade)) ?? [];
    const rows = ranking.grades.find((g) => g.grade === grade)?.rows ?? [];
    return {
      grade,
      classCount: active.filter((c) => c.grade === grade).length,
      incidents: inc.length,
      penaltyPoints: sumBy(inc, (i) => i.points),
      rewardPoints: sumBy(rewByGrade.get(String(grade)) ?? [], (r) => r.points),
      avgScore: rows.length ? round2(sumBy(rows, (r) => r.score) / rows.length) : 0,
      studentsInvolved: uniqueCount(inc.flatMap((i) => i.students.map((s) => s.id))),
      top90Count: rows.filter((r) => r.inTop90).length,
    };
  });
}

/** Incidents & points per category (Mảng): points desc, incidents desc, name. */
export function categoryBreakdown(incidents: Incident[]): Array<{ category: string; incidents: number; points: number }> {
  return [...groupBy(incidents, (i) => i.category).entries()]
    .map(([category, list]) => ({ category, incidents: list.length, points: sumBy(list, (i) => i.points) }))
    .sort((a, b) => b.points - a.points || b.incidents - a.incidents || compareVN(a.category, b.category));
}

const A_MONDAY = "2026-01-05";

/** Always 7 entries, Thứ Hai → Chủ nhật. */
export function weekdayDistribution(incidents: Incident[]): Array<{ weekday: string; incidents: number }> {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const i of incidents) if (isIsoDate(i.date)) counts[weekdayIndex(i.date)]++;
  return counts.map((n, idx) => ({ weekday: weekdayLabelVN(addDays(A_MONDAY, idx)), incidents: n }));
}
