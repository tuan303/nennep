/**
 * Học sinh vi phạm view model (pure – unit-tested). Student numbers come from the engine `studentStats`;
 * this file only filters, summarises and labels them for the screen, charts and export.
 */
import { matchesSearch, type StudentStat } from "@/lib/engine";
import type { StudentExportRow } from "@/lib/excel";
import { LEVELS } from "@/lib/constants";
import type { CatalogItem, ClassInfo, GlobalFilters, LevelId, Period, StudentLite } from "@/lib/types";
import { periodSlug } from "@/components/gvcn-report/lib/copy-text";

export type AlertFilter = "ALL" | "REPEAT" | "WEEKLY_RED";
export type StudentAlert = StudentStat["alert"];

/* --------------------------------- summary --------------------------------- */

/** ACTIVE students of the filtered scope (grade / class filters). */
export function activeStudentsInScope(students: readonly StudentLite[], f: Pick<GlobalFilters, "grade" | "classCode">): StudentLite[] {
  return students.filter(
    (s) => s.status === "ACTIVE" && (typeof f.grade !== "number" || s.grade === f.grade) && (!f.classCode || s.classCode === f.classCode),
  );
}

export interface StudentsSummary {
  /** Students named in at least one filtered incident. */
  withIncidents: number;
  repeat: number;
  weeklyRed: number;
  /** ACTIVE students in scope (denominator). */
  activeInScope: number;
  /** ACTIVE students in scope that have incidents (numerator). */
  activeWithIncidents: number;
  /** activeWithIncidents / activeInScope (0 when nobody is in scope). */
  ratio: number;
}

export function summarizeStudents(
  stats: readonly StudentStat[],
  students: readonly StudentLite[],
  f: Pick<GlobalFilters, "grade" | "classCode">,
): StudentsSummary {
  const active = activeStudentsInScope(students, f);
  const activeIds = new Set(active.map((s) => s.id));
  const activeWithIncidents = stats.filter((s) => activeIds.has(s.id)).length;
  return {
    withIncidents: stats.length,
    repeat: stats.filter((s) => s.alert === "REPEAT").length,
    weeklyRed: stats.filter((s) => s.alert === "WEEKLY_RED").length,
    activeInScope: active.length,
    activeWithIncidents,
    ratio: active.length > 0 ? activeWithIncidents / active.length : 0,
  };
}

/* --------------------------------- filters --------------------------------- */

export interface StudentRowFilter {
  query: string;
  alert: AlertFilter;
  minIncidents: number;
}

export const DEFAULT_ROW_FILTER: StudentRowFilter = { query: "", alert: "ALL", minIncidents: 1 };

export const MIN_INCIDENT_OPTIONS = [
  { value: "1", label: "Từ 1 lượt" },
  { value: "2", label: "Từ 2 lượt" },
  { value: "3", label: "Từ 3 lượt" },
  { value: "5", label: "Từ 5 lượt" },
] as const;

export function isDefaultRowFilter(f: StudentRowFilter): boolean {
  return f.query.trim() === "" && f.alert === "ALL" && f.minIncidents <= 1;
}

/** Search on name / Mã HS / class (accent-insensitive), alert and minimum number of incidents. Order kept. */
export function filterStudentRows(stats: readonly StudentStat[], f: StudentRowFilter): StudentStat[] {
  return stats.filter(
    (s) =>
      (f.alert === "ALL" || s.alert === f.alert) &&
      s.incidents >= f.minIncidents &&
      matchesSearch(`${s.name} ${s.id} ${s.classCode}`, f.query),
  );
}

/** Vietnamese roster order for sorting: given name (last word) first, then the full name. */
export function nameSortKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[words.length - 1]} ${words.join(" ")}` : name.trim();
}

/** Sort weight of an alert (WEEKLY_RED highest). */
export function alertRank(alert: StudentAlert): number {
  return alert === "WEEKLY_RED" ? 2 : alert === "REPEAT" ? 1 : 0;
}

/* ---------------------------------- chips ---------------------------------- */

export interface ErrorChip {
  errorCode: string;
  /** Short label, e.g. "Đồng phục không đúng…" (catalog displayName when set). */
  label: string;
  issue: string;
  count: number;
}

/** Short label of an error: catalog displayName, else the issue cut at the first ":" / ";" / "(" and at a word boundary. */
export function shortIssue(issue: string, displayName?: string, maxLen = 22): string {
  const base = (displayName?.trim() || issue.split(/[:;(]/)[0]).trim() || issue.trim();
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxLen / 2 ? cut.slice(0, space) : base.slice(0, maxLen)).replace(/[\s,.–-]+$/, "")}…`;
}

/** Up to `max` chips ("Đồng phục ×3") plus how many error types are left ("+2"). */
export function errorChips(
  errors: StudentStat["errors"],
  catalog: readonly Pick<CatalogItem, "code" | "displayName">[],
  max = 3,
): { chips: ErrorChip[]; more: number } {
  const names = new Map(catalog.map((c) => [c.code, c.displayName] as const));
  const chips = errors.slice(0, max).map((e) => ({ errorCode: e.errorCode, issue: e.issue, count: e.count, label: shortIssue(e.issue, names.get(e.errorCode)) }));
  return { chips, more: Math.max(0, errors.length - max) };
}

/* ---------------------------------- charts --------------------------------- */

/** Top `n` students by incidents (engine order: incidents desc, points desc) for a horizontal bar chart. */
export function topStudentsChart(stats: readonly StudentStat[], n = 10): { categories: string[]; incidents: number[]; points: number[]; ids: string[] } {
  const top = stats.slice(0, n);
  return {
    categories: top.map((s) => `${s.name} (${s.classCode})`),
    incidents: top.map((s) => s.incidents),
    points: top.map((s) => s.points),
    ids: top.map((s) => s.id),
  };
}

export const INCIDENT_BUCKETS = ["1 lượt", "2 lượt", "3 lượt", "4+ lượt"] as const;

/** Number of students with 1, 2, 3 and 4+ incidents. */
export function incidentDistribution(stats: readonly StudentStat[]): number[] {
  const counts = [0, 0, 0, 0];
  for (const s of stats) if (s.incidents > 0) counts[Math.min(s.incidents, 4) - 1] += 1;
  return counts;
}

/** Share of students with 2 or more incidents (0 when the distribution is empty). */
export function multiIncidentShare(distribution: readonly number[]): number {
  const total = distribution.reduce((a, b) => a + b, 0);
  return total > 0 ? (total - (distribution[0] ?? 0)) / total : 0;
}

/* ---------------------------------- export --------------------------------- */

export function toExportRows(stats: readonly StudentStat[]): StudentExportRow[] {
  return stats.map((s) => ({
    id: s.id,
    name: s.name,
    classCode: s.classCode,
    incidents: s.incidents,
    points: s.points,
    // "; " because catalog issues may contain commas themselves.
    errors: s.errors.map((e) => `${e.issue} (${e.count})`).join("; "),
    alert: s.alert,
  }));
}

/** "Lớp 6A01" / "Khối 6" / "" (whole level). */
export function scopeText(f: Pick<GlobalFilters, "grade" | "classCode">, classes?: readonly Pick<ClassInfo, "code">[]): string {
  if (f.classCode && (!classes || classes.some((c) => c.code === f.classCode))) return `Lớp ${f.classCode}`;
  if (typeof f.grade === "number") return `Khối ${f.grade}`;
  return "";
}

/** "Hoc-sinh-vi-pham-THCS-tuan-12-10-2026.xlsx" */
export function studentsExportFileName(levelId: LevelId, period: Period, f: Pick<GlobalFilters, "grade" | "classCode"> = {}): string {
  const scope = f.classCode ? `-${f.classCode}` : typeof f.grade === "number" ? `-khoi-${f.grade}` : "";
  return `Hoc-sinh-vi-pham-${LEVELS[levelId].id}${scope}-${periodSlug(period)}.xlsx`;
}
