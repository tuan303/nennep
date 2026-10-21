/** Roster view-model: search/filter, status counts, class sizes and the export rows (pure – unit-tested). */
import { compareClasses } from "@/components/app/widgets/lib/class-options";
import { compareStudentsByGivenName } from "@/components/app/widgets/lib/student-options";
import { STUDENT_STATUS_LABELS } from "@/lib/constants";
import type { StudentStat } from "@/lib/engine/analytics";
import { naturalCompare, normalizeVN } from "@/lib/engine/text";
import type { ClassInfo, StudentLite, StudentStatus } from "@/lib/types";
import type { StatusFilter } from "./labels";

export interface RosterFilters {
  /** Free text: name or Mã HS, accent-insensitive. */
  query: string;
  grade?: number;
  classCode?: string;
  status: StatusFilter;
}

export const DEFAULT_ROSTER_FILTERS: RosterFilters = { query: "", status: "ACTIVE" };

/** A roster row with its precomputed search key (folded "name id"). */
export interface RosterEntry {
  student: StudentLite;
  key: string;
}

export function isActive(status: StudentStatus): boolean {
  return status === "ACTIVE";
}

/** Roster order: class display order (grade, configured order, natural code), then Vietnamese given-name order. */
export function buildRosterIndex(students: readonly StudentLite[], classes: readonly ClassInfo[]): RosterEntry[] {
  const rank = classRankMap(classes);
  return [...students]
    .sort((a, b) => {
      const ra = rank.get(a.classCode);
      const rb = rank.get(b.classCode);
      if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
      if (ra === undefined && rb !== undefined) return 1;
      if (rb === undefined && ra !== undefined) return -1;
      if (ra === undefined && rb === undefined && a.classCode !== b.classCode) return a.grade - b.grade || naturalCompare(a.classCode, b.classCode);
      return compareStudentsByGivenName(a, b);
    })
    .map((student) => ({ student, key: normalizeVN(`${student.name} ${student.id}`) }));
}

/** Class code → position in display order (for sorting rows by class). */
export function classRankMap(classes: readonly ClassInfo[]): Map<string, number> {
  return new Map([...classes].sort(compareClasses).map((c, i) => [c.code, i] as const));
}

function matchesStatus(status: StudentStatus, f: StatusFilter): boolean {
  if (f === "ALL") return true;
  return f === "ACTIVE" ? status === "ACTIVE" : status !== "ACTIVE";
}

/** Students matching the filters, in roster order. */
export function filterRoster(index: readonly RosterEntry[], f: RosterFilters): StudentLite[] {
  const tokens = normalizeVN(f.query).split(" ").filter(Boolean);
  const out: StudentLite[] = [];
  for (const { student: s, key } of index) {
    if (!matchesStatus(s.status, f.status)) continue;
    if (f.grade !== undefined && s.grade !== f.grade) continue;
    if (f.classCode && s.classCode !== f.classCode) continue;
    if (tokens.length > 0 && !tokens.every((t) => key.includes(t))) continue;
    out.push(s);
  }
  return out;
}

/** Number of filters that narrow the list beyond the default "Đang học" view. */
export function activeFilterCount(f: RosterFilters): number {
  return (f.query.trim() ? 1 : 0) + (f.grade !== undefined ? 1 : 0) + (f.classCode ? 1 : 0) + (f.status !== DEFAULT_ROSTER_FILTERS.status ? 1 : 0);
}

/** "Họ tên" sort key: Vietnamese roster order (given name, then full name). */
export function nameSortKey(name: string): string {
  const n = normalizeVN(name);
  const i = n.lastIndexOf(" ");
  return `${i >= 0 ? n.slice(i + 1) : n} ${n}`;
}

export type StatusCounts = Record<StudentStatus, number> & { left: number; total: number };

export function statusCounts(students: readonly StudentLite[]): StatusCounts {
  const c: StatusCounts = { ACTIVE: 0, TRANSFERRED_OUT: 0, GRADUATED: 0, INACTIVE: 0, left: 0, total: 0 };
  for (const s of students) {
    c[s.status] += 1;
    c.total += 1;
    if (s.status !== "ACTIVE") c.left += 1;
  }
  return c;
}

/** "2 chuyển trường · 1 tốt nghiệp" (zero buckets omitted; "" when nobody left). */
export function leftBreakdownText(c: StatusCounts): string {
  const parts: string[] = [];
  if (c.TRANSFERRED_OUT) parts.push(`${c.TRANSFERRED_OUT} chuyển trường`);
  if (c.GRADUATED) parts.push(`${c.GRADUATED} tốt nghiệp`);
  if (c.INACTIVE) parts.push(`${c.INACTIVE} ngừng theo dõi`);
  return parts.join(" · ");
}

/* ------------------------------- Class sizes ------------------------------- */

export type SizeState = "match" | "over" | "under" | "unknown";

export interface ClassSizeRow {
  code: string;
  grade: number;
  homeroomTeacher?: string;
  classActive: boolean;
  /** ACTIVE students currently in the class. */
  activeCount: number;
  sourceSize?: number;
  /** activeCount − sourceSize (undefined without a source size). */
  diff?: number;
  state: SizeState;
}

/**
 * One row per active class, plus inactive classes that still hold active students (data to fix).
 * The comparison uses ACTIVE students only, against `ClassInfo.sourceSize` when it is set.
 */
export function classSizeRows(classes: readonly ClassInfo[], students: readonly StudentLite[]): ClassSizeRow[] {
  const counts = new Map<string, number>();
  for (const s of students) if (s.status === "ACTIVE") counts.set(s.classCode, (counts.get(s.classCode) ?? 0) + 1);
  return [...classes]
    .filter((c) => c.active || (counts.get(c.code) ?? 0) > 0)
    .sort(compareClasses)
    .map((c) => {
      const activeCount = counts.get(c.code) ?? 0;
      const hasSource = typeof c.sourceSize === "number";
      const diff = hasSource ? activeCount - (c.sourceSize as number) : undefined;
      const state: SizeState = diff === undefined ? "unknown" : diff === 0 ? "match" : diff > 0 ? "over" : "under";
      return { code: c.code, grade: c.grade, homeroomTeacher: c.homeroomTeacher, classActive: c.active, activeCount, sourceSize: c.sourceSize, diff, state };
    });
}

export function isSizeMismatch(r: ClassSizeRow): boolean {
  return r.state === "over" || r.state === "under";
}

export interface ClassSizeGroup {
  grade: number;
  rows: ClassSizeRow[];
  activeCount: number;
  mismatches: number;
}

export function classSizeGroups(rows: readonly ClassSizeRow[]): ClassSizeGroup[] {
  const map = new Map<number, ClassSizeGroup>();
  for (const r of rows) {
    const g = map.get(r.grade) ?? { grade: r.grade, rows: [], activeCount: 0, mismatches: 0 };
    g.rows.push(r);
    g.activeCount += r.activeCount;
    if (isSizeMismatch(r)) g.mismatches += 1;
    map.set(r.grade, g);
  }
  return [...map.values()].sort((a, b) => a.grade - b.grade);
}

export interface SizeSummary {
  classes: number;
  withSource: number;
  mismatches: number;
  /** Inactive classes that still hold active students. */
  inactiveWithStudents: number;
}

export function sizeSummary(rows: readonly ClassSizeRow[]): SizeSummary {
  return {
    classes: rows.filter((r) => r.classActive).length,
    withSource: rows.filter((r) => r.state !== "unknown").length,
    mismatches: rows.filter(isSizeMismatch).length,
    inactiveWithStudents: rows.filter((r) => !r.classActive).length,
  };
}

/** "Khớp" / "Thừa 2" / "Thiếu 3" / "Chưa có sĩ số nguồn". */
export function sizeStateText(r: Pick<ClassSizeRow, "state" | "diff">): string {
  if (r.state === "match") return "Khớp";
  if (r.state === "over") return `Thừa ${r.diff}`;
  if (r.state === "under") return `Thiếu ${Math.abs(r.diff ?? 0)}`;
  return "Chưa có sĩ số nguồn";
}

/* -------------------------------- Violations ------------------------------- */

/** Student id → number of incidents naming the student (engine studentStats). */
export function violationCountMap(stats: readonly StudentStat[]): Map<string, number> {
  return new Map(stats.map((s) => [s.id, s.incidents] as const));
}

/** ACTIVE students named in at least one incident. */
export function activeWithViolations(students: readonly StudentLite[], counts: ReadonlyMap<string, number>): number {
  let n = 0;
  for (const s of students) if (s.status === "ACTIVE" && (counts.get(s.id) ?? 0) > 0) n += 1;
  return n;
}

/* ---------------------------------- Export --------------------------------- */

export const ROSTER_EXPORT_COLUMNS = [
  { header: "Mã HS", key: "id", width: 14 },
  { header: "Họ và tên", key: "name", width: 30 },
  { header: "Ngày sinh", key: "dob" },
  { header: "Lớp", key: "classCode", width: 9 },
  { header: "Khối", key: "grade", width: 7 },
  { header: "Trạng thái", key: "status", width: 18 },
  { header: "Số lượt vi phạm", key: "violations", width: 16 },
];

/**
 * Rows for exportSimpleSheet. Headers match parseRosterSheet (Mã HS, Họ và tên, Ngày sinh, Lớp, Trạng thái),
 * so the file can be edited and imported back.
 */
export function rosterExportRows(students: readonly StudentLite[], counts: ReadonlyMap<string, number>): Array<Record<string, string | number | null>> {
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    dob: s.dob ?? null,
    classCode: s.classCode,
    grade: s.grade,
    status: STUDENT_STATUS_LABELS[s.status],
    violations: counts.get(s.id) ?? 0,
  }));
}

/** "Khối 6 · Lớp 6A01 · Đang học · “an”" – describes the exported selection. */
export function filterDescription(f: RosterFilters, statusLabel: string): string {
  const parts: string[] = [];
  if (f.classCode) parts.push(`Lớp ${f.classCode}`);
  else if (f.grade !== undefined) parts.push(`Khối ${f.grade}`);
  else parts.push("Tất cả lớp");
  parts.push(statusLabel);
  if (f.query.trim()) parts.push(`Tìm “${f.query.trim()}”`);
  return parts.join(" · ");
}
