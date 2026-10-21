/**
 * Inspection coverage (REQ_V2 §4.6, hạng mục 12 "kiểm tra công bằng"): how often each class was inspected compared with
 * the other classes of its grade, so penalty totals are compared fairly. `ds.inspections` may be absent (older
 * datasets) → treated as [].
 */
import type { GlobalFilters, Inspection, LevelDataset } from "../types";
import { filterIncidents } from "./filters";
import { periodMatcher } from "./period";
import { round2 } from "./scoring";
import { naturalCompare } from "./text";
import { compareClassInfo, compareStr, groupBy, sumBy } from "./utils";

/** A class inspected fewer than 60 % of its grade's average number of rounds is flagged LOW. */
export const DEFAULT_COVERAGE_MIN_RATIO = 0.6;

const classCodesOf = (r: Inspection): readonly string[] => r.classCodes ?? [];
const sessionKey = (r: Inspection) => `${r.date}|${r.shift ?? ""}`;

/**
 * Non-deleted inspections with date ≤ today in f.period (periodMatcher on week/month/semester); with f.category only
 * rounds of that Mảng or general rounds (no category); with grade/class filters only rounds touching a class of the
 * scope grade(s) (class filter → that class's grade; an unknown class → rounds naming it). errorCode / group / student
 * filters are ignored. Sorted date desc, code desc.
 */
export function filterInspections(ds: LevelDataset, f: GlobalFilters, today: string): Inspection[] {
  const inPeriod = periodMatcher(f.period, ds.weeks);
  const gradeOf = new Map(ds.classes.map((c) => [c.code, c.grade] as const));
  let grades: Set<number> | undefined;
  let namedClass: string | undefined;
  if (f.classCode) {
    const g = gradeOf.get(f.classCode);
    if (g === undefined) namedClass = f.classCode;
    else grades = new Set(typeof f.grade === "number" && f.grade !== g ? [] : [g]);
  } else if (typeof f.grade === "number") grades = new Set([f.grade]);

  return (ds.inspections ?? [])
    .filter((r) => {
      if (r.deletedAt || r.date > today || !inPeriod(r)) return false;
      if (f.category && r.category && r.category !== f.category) return false;
      const codes = classCodesOf(r);
      if (namedClass !== undefined) return codes.includes(namedClass);
      if (grades) {
        const scope = grades;
        return codes.some((code) => {
          const g = gradeOf.get(code);
          return g !== undefined && scope.has(g);
        });
      }
      return true;
    })
    .sort((a, b) => compareStr(b.date, a.date) || naturalCompare(b.code, a.code));
}

export type CoverageStatus = "OK" | "LOW" | "NONE";

export interface CoverageRow {
  classCode: string;
  grade: number;
  homeroomTeacher?: string;
  /** In-scope rounds whose classCodes include the class. */
  rounds: number;
  /** Distinct `${date}|${shift ?? ""}` of those rounds (số buổi). */
  sessions: number;
  lastDate?: string;
  /** filterIncidents(ds, { ...f, classCode: undefined, studentId: undefined }) of the class. */
  incidents: number;
  points: number;
  /** round2(incidents / rounds), null when rounds = 0. */
  incidentsPerRound: number | null;
  /** Mean rounds over the active classes of the grade (round2). */
  gradeAvgRounds: number;
  /** round2(rounds / gradeAvgRounds), null when gradeAvgRounds = 0. */
  coverageRatio: number | null;
  /** NONE: rounds = 0 while gradeAvgRounds > 0; LOW: ratio < minRatio; else OK. */
  status: CoverageStatus;
  /** f.classCode === classCode. */
  highlighted: boolean;
}

export interface GradeCoverage {
  grade: number;
  avgRounds: number;
  minRounds: number;
  maxRounds: number;
  /** No class of the grade was inspected in the scope. */
  noInspections: boolean;
  rows: CoverageRow[];
}

export interface InspectionCoverage {
  /** In-scope rounds. */
  rounds: number;
  /** Distinct sessions (date + buổi) of the in-scope rounds. */
  sessions: number;
  classesInspected: number;
  classesTotal: number;
  /** Grades of the scope (class filter → that class's grade, population unchanged). */
  grades: GradeCoverage[];
  /** status ≠ OK; NONE first, then ratio asc, then class. */
  flagged: CoverageRow[];
  minRatio: number;
}

const STATUS_ORDER: Record<CoverageStatus, number> = { NONE: 0, LOW: 1, OK: 2 };

/**
 * Coverage of the in-scope rounds (filterInspections) over every ACTIVE class of the scope grades, in display order.
 * Incident counts honour every filter except class / student (same population as the ranking).
 */
export function inspectionCoverage(ds: LevelDataset, f: GlobalFilters, today: string, opts: { minRatio?: number } = {}): InspectionCoverage {
  const minRatio = opts.minRatio ?? DEFAULT_COVERAGE_MIN_RATIO;
  const rounds = filterInspections(ds, f, today);
  const active = ds.classes.filter((c) => c.active).sort(compareClassInfo);
  let grades = [...new Set(active.map((c) => c.grade))].sort((a, b) => a - b);
  if (typeof f.grade === "number") grades = grades.filter((g) => g === f.grade);
  const filteredClass = f.classCode ? ds.classes.find((c) => c.code === f.classCode) : undefined;
  if (filteredClass) grades = grades.filter((g) => g === filteredClass.grade);

  const roundsByClass = new Map<string, Inspection[]>();
  for (const r of rounds) {
    for (const code of new Set(classCodesOf(r))) {
      const list = roundsByClass.get(code);
      if (list) list.push(r);
      else roundsByClass.set(code, [r]);
    }
  }
  const incByClass = groupBy(filterIncidents(ds, { ...f, classCode: undefined, studentId: undefined }), (i) => i.classCode);

  const gradeRows: GradeCoverage[] = grades.map((grade) => {
    const classes = active.filter((c) => c.grade === grade);
    const counts = classes.map((c) => (roundsByClass.get(c.code) ?? []).length);
    const avg = classes.length ? round2(counts.reduce((s, n) => s + n, 0) / classes.length) : 0;
    const rows = classes.map((c, idx): CoverageRow => {
      const own = roundsByClass.get(c.code) ?? [];
      const inc = incByClass.get(c.code) ?? [];
      const n = counts[idx];
      const ratio = avg > 0 ? round2(n / avg) : null;
      const row: CoverageRow = {
        classCode: c.code,
        grade,
        rounds: n,
        sessions: new Set(own.map(sessionKey)).size,
        incidents: inc.length,
        points: sumBy(inc, (i) => i.points),
        incidentsPerRound: n > 0 ? round2(inc.length / n) : null,
        gradeAvgRounds: avg,
        coverageRatio: ratio,
        status: avg > 0 && n === 0 ? "NONE" : ratio !== null && ratio < minRatio ? "LOW" : "OK",
        highlighted: f.classCode === c.code,
      };
      if (c.homeroomTeacher) row.homeroomTeacher = c.homeroomTeacher;
      const last = own.reduce((m, r) => (r.date > m ? r.date : m), "");
      if (last) row.lastDate = last;
      return row;
    });
    const max = counts.length ? Math.max(...counts) : 0;
    return {
      grade,
      avgRounds: avg,
      minRounds: counts.length ? Math.min(...counts) : 0,
      maxRounds: max,
      noInspections: max === 0,
      rows,
    };
  });

  const allRows = gradeRows.flatMap((g) => g.rows);
  const flagged = allRows
    .filter((r) => r.status !== "OK")
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.coverageRatio ?? 0) - (b.coverageRatio ?? 0) ||
        naturalCompare(a.classCode, b.classCode),
    );
  return {
    rounds: rounds.length,
    sessions: new Set(rounds.map(sessionKey)).size,
    classesInspected: allRows.filter((r) => r.rounds > 0).length,
    classesTotal: allRows.length,
    grades: gradeRows,
    flagged,
    minRatio,
  };
}
