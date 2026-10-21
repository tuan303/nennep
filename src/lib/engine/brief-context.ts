/** Data gathering + text helpers for the Decision Brief (internal to brief.ts). */
import type { Incident, LevelDataset, Period, RankingRow } from "../types";
import { classStats, fiveS, kpiComparison, recidivism, topIssues } from "./analytics";
import type { ClassStat, IssueStat, Kpis, RecidivistClass, StudentStat } from "./analytics";
import { filterIncidents } from "./filters";
import { periodLabel, previousPeriod } from "./period";
import { buildRanking } from "./ranking";
import { formatNumberVN } from "./text";

export interface FiveSSummary {
  incidents: number;
  points: number;
  topClass?: { classCode: string; points: number };
}

export interface BriefContext {
  ds: LevelDataset;
  period: Period;
  today: string;
  label: string;
  current: Kpis;
  previous?: Kpis;
  previousLabel?: string;
  incidents: Incident[];
  issues: IssueStat[];
  classes: ClassStat[];
  rows: RankingRow[];
  grades: Array<{ grade: number; rows: RankingRow[] }>;
  students: StudentStat[];
  recidivistClasses: RecidivistClass[];
  fiveSCurrent: FiveSSummary;
  fiveSPrevious?: FiveSSummary;
  activeClassCount: number;
}

export function collectBriefContext(ds: LevelDataset, period: Period, today: string): BriefContext {
  const f = { period };
  const { current, previous, previousLabel } = kpiComparison(ds, f);
  const ranking = buildRanking(ds, period, today);
  const recid = recidivism(ds, f, today);
  const prev = previousPeriod(period, ds.weeks, ds.config.semesters);
  const fiveSOf = (p: Period): FiveSSummary => {
    const r = fiveS(ds, { period: p }, today);
    const top = r.byClass[0];
    return { incidents: r.incidents, points: r.points, topClass: top ? { classCode: top.classCode, points: top.points } : undefined };
  };
  const incidents = filterIncidents(ds, f);
  return {
    ds,
    period,
    today,
    label: periodLabel(period, ds.config.semesters),
    current,
    previous,
    previousLabel,
    incidents,
    issues: topIssues(incidents, 3),
    classes: classStats(ds, f),
    rows: ranking.grades.flatMap((g) => g.rows),
    grades: ranking.grades,
    students: recid.students,
    recidivistClasses: recid.classes,
    fiveSCurrent: fiveSOf(period),
    fiveSPrevious: prev ? fiveSOf(prev) : undefined,
    activeClassCount: ds.classes.filter((c) => c.active).length,
  };
}

/** "tăng 20%", "giảm 5%", "không đổi", "kỳ trước chưa phát sinh". */
export function changeText(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "không đổi" : "kỳ trước chưa phát sinh";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 0) return `tăng ${pct}%`;
  if (pct < 0) return `giảm ${-pct}%`;
  return "không đổi";
}

/** Percentage change (rounded) or undefined when the previous value is 0. */
export function changePct(cur: number, prev: number | undefined): number | undefined {
  if (prev === undefined || prev === 0) return undefined;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Quote an issue text, truncated for readability. */
export function q(issue: string, max = 60): string {
  const t = issue.length > max ? issue.slice(0, max - 1).trimEnd() + "…" : issue;
  return `"${t}"`;
}

export const num = (n: number): string => formatNumberVN(n);

/** "A, B, C và 2 lớp khác" style list. */
export function listText(items: string[], max = 4, unit = "mục"): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} và ${items.length - max} ${unit} khác`;
}
