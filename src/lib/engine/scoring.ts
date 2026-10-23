/**
 * Point calculation, incident validation and data-quality classification.
 * Pure functions – used by the server (authoritative) and by the client (live preview in forms).
 *
 * BR-POINT-01  /HS  : points = penalty × relatedStudentCount   (relatedStudentCount = named + unnamed)
 * BR-POINT-02  /lần : points = penalty × occurrenceCount        (default 1, never multiplied by students)
 * BR-POINT-03  /HS requires relatedStudentCount >= 1
 * BR-POINT-04  scope "Cá nhân" requires at least one NAMED student
 * NSHM decision: "/HS" + "Tập thể" may use `unnamedCount` (names unknown) → counted, flagged THIEU_TEN_HS.
 */
import type {
  CatalogItem,
  ClassInfo,
  DataCheck,
  DataIssue,
  DataIssueCode,
  Incident,
  IncidentStatus,
  SchoolWeek,
  Scope,
  Semester,
  StudentLite,
  StudentRef,
  Unit,
} from "../types";
import { isIsoDate, weekInfo } from "./dates";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lượt vi phạm of one incident (KPI_TERMS.violationTurns): "/HS" → relatedStudentCount (named + unnamed);
 * "/lần" → occurrenceCount (≥ 1, as computePoints).
 */
export function violationTurnsOf(i: Pick<Incident, "unit" | "relatedStudentCount" | "occurrenceCount">): number {
  if (i.unit === "/HS") return Math.max(0, i.relatedStudentCount || 0);
  return Math.max(1, Math.floor(i.occurrenceCount || 1));
}

export interface PointsInput {
  unit: Unit;
  penalty: number;
  namedCount: number;
  unnamedCount: number;
  occurrenceCount: number;
}

export function computePoints(i: PointsInput): number {
  if (i.unit === "/HS") return round2(i.penalty * (Math.max(0, i.namedCount) + Math.max(0, i.unnamedCount)));
  return round2(i.penalty * Math.max(1, Math.floor(i.occurrenceCount || 1)));
}

/** "/HS" ignores occurrenceCount (=1); "/lần" and non-"Tập thể" scopes ignore unnamedCount (=0). */
export function normalizeCounts(
  unit: Unit,
  scope: Scope,
  occurrenceCount: number | undefined,
  unnamedCount: number | undefined,
): { occurrenceCount: number; unnamedCount: number } {
  return {
    occurrenceCount: unit === "/HS" ? 1 : Math.max(1, Math.floor(occurrenceCount ?? 1)),
    unnamedCount: unit === "/HS" && scope === "Tập thể" ? Math.max(0, Math.floor(unnamedCount ?? 0)) : 0,
  };
}

export interface DraftIncident {
  date: string;
  classCode: string;
  errorCode: string;
  scope: Scope;
  occurrenceCount?: number;
  studentIds: string[];
  unnamedCount?: number;
}

export interface RuleContext {
  catalogItem: CatalogItem | undefined;
  classInfo: ClassInfo | undefined;
  studentsById: Map<string, StudentLite>;
  today: string; // yyyy-mm-dd (VN)
}

/**
 * Hard validation for incidents created/edited in the app. Returns Vietnamese messages; [] = valid.
 * (Imports use `computeDataCheck` with extra issues instead, so legacy rows are kept for review.)
 */
export function validateIncidentRules(input: DraftIncident, ctx: RuleContext): string[] {
  const errors: string[] = [];
  const { catalogItem, classInfo } = ctx;

  if (!isIsoDate(input.date)) errors.push("Ngày không hợp lệ.");
  else if (input.date > ctx.today) errors.push("Không thể ghi nhận sự việc ở ngày trong tương lai.");

  if (!classInfo) errors.push(`Lớp "${input.classCode}" không có trong danh mục.`);
  else if (!classInfo.active) errors.push(`Lớp ${classInfo.code} đã ngừng hoạt động.`);

  if (!catalogItem) errors.push(`Mã lỗi "${input.errorCode}" không có trong bảng điểm lỗi.`);
  else if (!catalogItem.active) errors.push(`Lỗi ${catalogItem.code} đã ngừng sử dụng.`);

  const seen = new Set<string>();
  for (const id of input.studentIds) {
    if (seen.has(id)) {
      errors.push(`Học sinh mã ${id} bị chọn hai lần.`);
      continue;
    }
    seen.add(id);
    const s = ctx.studentsById.get(id);
    if (!s) errors.push(`Không tìm thấy học sinh mã ${id}.`);
    else if (s.classCode !== input.classCode) errors.push(`${s.name} (${s.classCode}) không thuộc lớp ${input.classCode}.`);
    else if (s.status !== "ACTIVE") errors.push(`${s.name} không còn ở trạng thái Đang học.`);
  }

  const unnamed = Math.max(0, Math.floor(input.unnamedCount ?? 0));
  if (catalogItem) {
    if (unnamed > 0 && !(catalogItem.unit === "/HS" && input.scope === "Tập thể")) {
      errors.push("Chỉ được nhập số học sinh không rõ tên cho lỗi tính theo học sinh (/HS) với phạm vi Tập thể.");
    }
    const named = input.studentIds.length;
    if (catalogItem.unit === "/HS" && named + (input.scope === "Tập thể" ? unnamed : 0) < 1) {
      errors.push("Lỗi tính theo học sinh (/HS) cần ít nhất 1 học sinh: chọn tên học sinh hoặc nhập số học sinh.");
    }
    if (catalogItem.unit === "/lần" && input.occurrenceCount !== undefined && input.occurrenceCount < 1) {
      errors.push("Số lần vi phạm phải từ 1 trở lên.");
    }
  }
  if (input.scope === "Cá nhân" && input.studentIds.length < 1) {
    errors.push("Phạm vi Cá nhân phải chọn học sinh liên quan.");
  }
  return errors;
}

/** Issue codes that make a record unreliable (REVIEW). Others are informational. */
const REVIEW_CODES: ReadonlySet<DataIssueCode> = new Set<DataIssueCode>([
  "MISSING_STUDENTS",
  "STUDENT_WRONG_CLASS",
  "STUDENT_NOT_FOUND",
  "DUPLICATE_STUDENT",
  "POINTS_MISMATCH_IMPORT",
  "UNKNOWN_ERROR_CODE",
  "UNKNOWN_CLASS",
  "INVALID_DATE",
  "OTHER",
]);

export function computeDataCheck(args: {
  unit: Unit;
  namedCount: number;
  unnamedCount: number;
  extraIssues?: DataIssue[];
}): { dataCheck: DataCheck; dataIssues: DataIssue[] } {
  const issues: DataIssue[] = [...(args.extraIssues ?? [])];
  if (args.unit === "/HS" && args.namedCount + args.unnamedCount === 0 && !issues.some((i) => i.code === "MISSING_STUDENTS")) {
    issues.push({ code: "MISSING_STUDENTS", message: "Lỗi tính theo học sinh nhưng chưa có học sinh liên quan (điểm trừ = 0)." });
  }
  if (args.unnamedCount > 0 && !issues.some((i) => i.code === "UNNAMED_STUDENTS")) {
    issues.push({ code: "UNNAMED_STUDENTS", message: `${args.unnamedCount} học sinh chưa rõ tên.` });
  }
  let dataCheck: DataCheck = "OK";
  if (issues.some((i) => REVIEW_CODES.has(i.code))) dataCheck = "REVIEW";
  else if (issues.some((i) => i.code === "UNNAMED_STUDENTS")) dataCheck = "THIEU_TEN_HS";
  return { dataCheck, dataIssues: issues };
}

/** Reliable for Data Confidence: OK and THIEU_TEN_HS (counted by NSHM decision). */
export function isReliable(dc: DataCheck): boolean {
  return dc !== "REVIEW";
}

/** Fields of an Incident that are fully determined by business rules + context. */
export type IncidentCore = Pick<
  Incident,
  | "date"
  | "week"
  | "month"
  | "semester"
  | "classCode"
  | "grade"
  | "errorCode"
  | "category"
  | "issue"
  | "group"
  | "penalty"
  | "unit"
  | "scope"
  | "occurrenceCount"
  | "students"
  | "unnamedCount"
  | "relatedStudentCount"
  | "points"
  | "status"
  | "dataCheck"
  | "dataIssues"
  | "evidenceUrls"
  | "photoIds"
> & { reporter?: string; detail?: string };

/**
 * Assemble the rule-derived part of an incident (server-authoritative).
 * `students` must already be resolved snapshots (id, name, classCode at time of recording).
 */
export function buildIncidentCore(
  input: {
    date: string;
    scope: Scope;
    occurrenceCount?: number;
    unnamedCount?: number;
    status?: IncidentStatus;
    reporter?: string;
    detail?: string;
    evidenceUrls?: string[];
    photoIds?: string[];
  },
  ctx: {
    catalogItem: CatalogItem;
    classInfo: ClassInfo;
    students: StudentRef[];
    weeks: SchoolWeek[];
    semesters: Semester[];
    extraIssues?: DataIssue[];
  },
): IncidentCore {
  const { catalogItem: c, classInfo } = ctx;
  const counts = normalizeCounts(c.unit, input.scope, input.occurrenceCount, input.unnamedCount);
  const named = ctx.students.length;
  const { week, month, semester } = weekInfo(input.date, ctx.weeks, ctx.semesters);
  const { dataCheck, dataIssues } = computeDataCheck({
    unit: c.unit,
    namedCount: named,
    unnamedCount: counts.unnamedCount,
    extraIssues: ctx.extraIssues,
  });
  const core: IncidentCore = {
    date: input.date,
    week,
    month,
    semester,
    classCode: classInfo.code,
    grade: classInfo.grade,
    errorCode: c.code,
    category: c.category,
    issue: c.issue,
    penalty: c.penalty,
    unit: c.unit,
    scope: input.scope,
    occurrenceCount: counts.occurrenceCount,
    students: ctx.students,
    unnamedCount: counts.unnamedCount,
    relatedStudentCount: named + counts.unnamedCount,
    points: computePoints({
      unit: c.unit,
      penalty: c.penalty,
      namedCount: named,
      unnamedCount: counts.unnamedCount,
      occurrenceCount: counts.occurrenceCount,
    }),
    status: input.status ?? "Mới ghi nhận",
    dataCheck,
    dataIssues,
    evidenceUrls: input.evidenceUrls ?? [],
    photoIds: input.photoIds ?? [],
  };
  if (c.group) core.group = c.group;
  if (input.reporter) core.reporter = input.reporter;
  if (input.detail) core.detail = input.detail;
  return core;
}
