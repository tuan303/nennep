/** Student statistics, alerts, history and recidivism (students & classes). Re-exported by analytics.ts. */
import type { GlobalFilters, Incident, LevelConfig, LevelDataset, Period, RagStatus, SchoolWeek, StudentRef, StudentStatus } from "../types";
import { diffDays, mondayOf } from "./dates";
import { filterIncidents } from "./filters";
import { ALL_PERIOD, contextPeriod, elapsedWeeksInPeriod, isAllPeriod, periodMatcher } from "./period";
import { dataConfidence, ragFor } from "./rag";
import { compareVN, naturalCompare } from "./text";
import { compareStr, groupBy, sumBy } from "./utils";

export interface StudentStat {
  id: string;
  name: string;
  classCode: string;
  grade: number;
  status: StudentStatus;
  incidents: number;
  points: number;
  errors: Array<{ errorCode: string; issue: string; count: number }>;
  lastDate: string;
  maxPerWeek: number;
  alert: "NONE" | "REPEAT" | "WEEKLY_RED";
}

/** Newest first: date desc, then createdAt desc, then code desc. */
export function compareIncidentsNewestFirst(a: Incident, b: Incident): number {
  return compareStr(b.date, a.date) || compareStr(b.createdAt, a.createdAt) || naturalCompare(b.code, a.code);
}

/** Weeks (Mondays) of the incidents naming each student; a student named twice in one incident counts once. */
function weeksByStudent(incidents: readonly Incident[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const i of incidents) {
    const seen = new Set<string>();
    for (const s of i.students) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const list = out.get(s.id);
      if (list) list.push(i.week);
      else out.set(s.id, [i.week]);
    }
  }
  return out;
}

/**
 * "Tái phạm": one of the student's incidents in `periodWeeks` is at least the `min`-th incident of `historyWeeks` within the
 * `windowWeeks` calendar weeks ending with that incident's week. `historyWeeks` must include the period's own incidents.
 */
function isRepeatOffender(periodWeeks: readonly string[], historyWeeks: readonly string[], windowWeeks: number, min: number): boolean {
  if (min <= 0) return periodWeeks.length > 0;
  const span = 7 * Math.max(1, windowWeeks);
  return [...new Set(periodWeeks)].some((end) => {
    let count = 0;
    for (const w of historyWeeks) {
      const d = diffDays(end, w);
      if (d >= 0 && d < span) count++;
    }
    return count >= min;
  });
}

function studentAlert(periodWeeks: string[], historyWeeks: string[], maxPerWeek: number, config: LevelConfig): StudentStat["alert"] {
  const { perWeek, repeatWindowWeeks, repeatMin } = config.studentAlert;
  if (maxPerWeek >= perWeek) return "WEEKLY_RED";
  if (isRepeatOffender(periodWeeks, historyWeeks, repeatWindowWeeks, repeatMin)) return "REPEAT";
  return "NONE";
}

/**
 * Build stats for every student named in `incidents` (a student named twice in one incident counts once).
 * incidents / points / errors / lastDate / maxPerWeek describe `incidents` only. The alert looks further back:
 * - WEEKLY_RED: ≥ studentAlert.perWeek of `incidents` in one week;
 * - REPEAT: one of `incidents` is the student's ≥ repeatMin-th incident of `history` within the repeatWindowWeeks weeks
 *   ending with its week. `history` defaults to `incidents`; pass the same records without the period restriction so that
 *   incidents shortly before the period count too (a superset of `incidents`).
 */
export function studentStatsFromIncidents(ds: LevelDataset, incidents: Incident[], history: Incident[] = incidents): StudentStat[] {
  const roster = new Map(ds.students.map((s) => [s.id, s] as const));
  const historyWeeks = history === incidents ? undefined : weeksByStudent(history);
  const acc = new Map<string, { ref: StudentRef; grade: number; items: Incident[] }>();
  for (const i of incidents) {
    const seen = new Set<string>();
    for (const s of i.students) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const entry = acc.get(s.id);
      if (entry) entry.items.push(i);
      else acc.set(s.id, { ref: s, grade: i.grade, items: [i] });
    }
  }

  const stats = [...acc.entries()].map(([id, { ref, grade, items }]): StudentStat => {
    const current = roster.get(id);
    const perWeek = groupBy(items, (i) => i.week);
    const maxPerWeek = Math.max(...[...perWeek.values()].map((l) => l.length));
    const errors = [...groupBy(items, (i) => i.errorCode).entries()]
      .map(([errorCode, list]) => ({ errorCode, issue: list[0].issue, count: list.length }))
      .sort((a, b) => b.count - a.count || naturalCompare(a.errorCode, b.errorCode));
    const periodWeeks = items.map((i) => i.week);
    return {
      id,
      name: current?.name ?? ref.name,
      classCode: current?.classCode ?? ref.classCode,
      grade: current?.grade ?? grade,
      status: current?.status ?? "ACTIVE",
      incidents: items.length,
      // A named student carries `penalty` for each "/HS" incident; "/lần" points are never attributed to individuals.
      points: sumBy(items, (i) => (i.unit === "/HS" ? i.penalty : 0)),
      errors,
      lastDate: items.reduce((m, i) => (i.date > m ? i.date : m), ""),
      maxPerWeek,
      alert: studentAlert(periodWeeks, historyWeeks?.get(id) ?? periodWeeks, maxPerWeek, ds.config),
    };
  });
  return stats.sort(
    (a, b) => b.incidents - a.incidents || b.points - a.points || compareVN(a.name, b.name) || naturalCompare(a.id, b.id),
  );
}

/**
 * Students named in the filtered incidents; incidents desc, points desc, name. Name/class/grade/status come from the
 * current roster (fallback when missing from the roster, e.g. redacted datasets: incident snapshot + status "ACTIVE").
 * Counts describe the period; the REPEAT alert also looks back up to repeatWindowWeeks − 1 weeks before the period
 * (same grade/class/category/error filters), so a student reoffending across weeks is flagged in week mode too.
 * Incidents after the period never count. `today` is accepted for API symmetry.
 */
export function studentStats(ds: LevelDataset, f: GlobalFilters, today: string): StudentStat[] {
  void today;
  const incidents = filterIncidents(ds, f);
  if (incidents.length === 0) return [];
  const history = isAllPeriod(f.period) ? incidents : filterIncidents(ds, { ...f, period: ALL_PERIOD });
  return studentStatsFromIncidents(ds, incidents, history);
}

/** Every incident naming the student (optionally inside a period), newest first. */
export function studentHistory(ds: LevelDataset, studentId: string, period?: Period): Incident[] {
  const inPeriod = periodMatcher(period ?? ALL_PERIOD, ds.weeks);
  return ds.incidents
    .filter((i) => !i.deletedAt && inPeriod(i) && i.students.some((s) => s.id === studentId))
    .sort(compareIncidentsNewestFirst);
}

export interface RecidivistClass {
  classCode: string;
  grade: number;
  consecutiveWeeks: number;
  lastRag: RagStatus;
}

/**
 * Counted, elapsed weeks a class streak is measured on, ascending. A week period has no room for "consecutive weeks",
 * so it is extended back over its semester (contextPeriod) and the streak ends with the selected week.
 */
function streakWeeks(period: Period, weeks: SchoolWeek[], today: string): SchoolWeek[] {
  const context = contextPeriod(period, weeks);
  const elapsed = elapsedWeeksInPeriod(context.period, weeks, today);
  const end = context.widened ? period.key : undefined;
  return elapsed.filter((w) => w.counted && (end === undefined || w.weekStart <= end));
}

/**
 * Recidivism (FR-RAG-004).
 * - students: studentStats with alert ≠ NONE (REPEAT looks back repeatWindowWeeks before the period, see studentStats).
 * - classes: active classes in scope whose weekly penalty was ≥ config.rag.yellow for ≥ 2 most recent consecutive
 *   elapsed counted weeks of the period (whole calendar for "all"; for a week: the weeks of its semester up to that
 *   week – contextPeriod). Holiday (non-counted) weeks are skipped; the in-progress current week is skipped while still
 *   below the threshold. Category/error filters are honoured.
 *   lastRag = ragFor(latest qualifying week) – GRAY when thresholds are not approved or data is unreliable.
 */
export function recidivism(ds: LevelDataset, f: GlobalFilters, today: string): { students: StudentStat[]; classes: RecidivistClass[] } {
  const students = studentStats(ds, f, today).filter((s) => s.alert !== "NONE");
  const { config } = ds;
  const currentMonday = mondayOf(today);
  const weeks = streakWeeks(f.period, ds.weeks, today);
  const byClassWeek = groupBy(filterIncidents(ds, { ...f, period: ALL_PERIOD }), (i) => `${i.classCode}|${i.week}`);
  const itemsOf = (code: string, week: string) => byClassWeek.get(`${code}|${week}`) ?? [];
  const penaltyOf = (code: string, week: string) => sumBy(itemsOf(code, week), (i) => i.points);
  const hasGrade = typeof f.grade === "number";

  const classes: RecidivistClass[] = [];
  for (const c of ds.classes) {
    if (!c.active || (hasGrade && c.grade !== f.grade) || (f.classCode && c.code !== f.classCode)) continue;
    let idx = weeks.length - 1;
    if (idx >= 0 && weeks[idx].weekStart === currentMonday && penaltyOf(c.code, weeks[idx].weekStart) < config.rag.yellow) idx--;
    let streak = 0;
    let latest: string | undefined;
    for (let k = idx; k >= 0; k--) {
      const week = weeks[k].weekStart;
      if (penaltyOf(c.code, week) < config.rag.yellow) break;
      streak++;
      latest ??= week;
    }
    if (streak < 2 || !latest) continue;
    const { rag } = ragFor({
      avgWeeklyPenalty: penaltyOf(c.code, latest),
      confidence: dataConfidence(itemsOf(c.code, latest)),
      config,
    });
    classes.push({ classCode: c.code, grade: c.grade, consecutiveWeeks: streak, lastRag: rag });
  }
  classes.sort((a, b) => b.consecutiveWeeks - a.consecutiveWeeks || naturalCompare(a.classCode, b.classCode));
  return { students, classes };
}
