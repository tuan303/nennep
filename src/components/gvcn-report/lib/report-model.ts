/**
 * Báo GVCN view model (pure – unit-tested). Every business number comes from the engine; this file only
 * selects, orders and labels data for the class report.
 */
import {
  buildRanking,
  compareIncidentsNewestFirst,
  filterRewards,
  filterIncidents,
  findRankingRow,
  kpiComparison,
  matchesSearch,
  naturalCompare,
  rankingRuleOf,
  studentStats,
  weekdayIndex,
  type Kpis,
  type StudentStat,
} from "@/lib/engine";
import { rosterNames, studentDisplayName, withRosterNames, type RosterNames } from "@/components/entry/lib/student-names";
import { rankRuleHint } from "@/components/class-detail/lib/class-view";
import type { FeedbackRights } from "@/components/app/widgets/lib/incident-access";
import { feedbackChanges } from "@/components/app/widgets/lib/remediation";
import type { GvcnFeedbackInput } from "@/lib/contract";
import type {
  CatalogItem,
  ClassInfo,
  GlobalFilters,
  Incident,
  IncidentStatus,
  LevelDataset,
  LevelId,
  Period,
  PeriodMode,
  RankingRow,
  Reward,
  RewardStatus,
  StudentLite,
  UserProfile,
} from "@/lib/types";

/* ------------------------------ class choice ------------------------------ */

/** Own classes of a GVCN in a level, in natural order (only codes that exist in the dataset when possible). */
export function ownClassesOf(
  profile: Pick<UserProfile, "role" | "gvcnClasses"> | undefined,
  levelId: LevelId,
  classes: Pick<ClassInfo, "code">[],
): string[] {
  if (!profile || profile.role !== "GVCN") return [];
  const codes = [...new Set(profile.gvcnClasses.filter((c) => c.levelId === levelId).map((c) => c.classCode))];
  const known = new Set(classes.map((c) => c.code));
  const existing = codes.filter((c) => known.has(c));
  return (existing.length > 0 ? existing : codes).sort(naturalCompare);
}

export interface ReportClassChoice {
  /** Class shown in the report (undefined → ask the user to pick one). */
  classCode?: string;
  /** A class filter that a GVCN may not use here (another teacher's class). */
  ignoredFilterClass?: string;
}

/** GVCN: the filtered class when it is theirs, else their first class. Others: the global class filter. */
export function resolveReportClass(args: { isGvcn: boolean; ownClasses: readonly string[]; filterClass?: string }): ReportClassChoice {
  const { isGvcn, ownClasses, filterClass } = args;
  if (!isGvcn) return { classCode: filterClass };
  if (filterClass && ownClasses.includes(filterClass)) return { classCode: filterClass };
  const choice: ReportClassChoice = { classCode: ownClasses[0] };
  if (filterClass) choice.ignoredFilterClass = filterClass;
  return choice;
}

/* --------------------------------- report --------------------------------- */

export type StudentConcern = StudentStat;

export interface GvcnReport {
  classCode: string;
  classInfo?: ClassInfo;
  /** ACTIVE students currently in the class (0 when the roster is not visible). */
  activeStudents: number;
  period: Period;
  /** Scope used for every engine call: period + class only (category/error filters do not apply to a class report). */
  scope: GlobalFilters;
  /**
   * Oldest first (reads like a diary; same order as the Excel export and the copied text). Display copies: student
   * names follow the current roster (a corrected name shows everywhere – table, copied text, Excel, print); ids and
   * snapshot classes are unchanged. Open / update records by id.
   */
  incidents: Incident[];
  kpis: Kpis;
  previous?: Kpis;
  /** Row of the class in its ranking table: the grade, or the whole level for THPT (rank n/21, RankingRule). */
  ranking?: RankingRow;
  /** "Hạng khối 6" | "Hạng toàn cấp" (THPT) – label of the rank in the KPIs and the copied text. */
  rankLabel: string;
  /** How the level ranks its classes (population + tie-break), for the rank tooltip. */
  rankHint: string;
  /** Students named in the class incidents: alerts first, then incidents desc, points desc. */
  students: StudentConcern[];
  /** All rewards of the class in the period, newest first. */
  rewards: Reward[];
  countedStatuses: RewardStatus[];
  /** config.top90Ratio of the level (names the Top group: "Top 90%", "Top 80%"…). */
  topRatio?: number;
}

const ALERT_ORDER: Record<StudentStat["alert"], number> = { WEEKLY_RED: 0, REPEAT: 1, NONE: 2 };

export function buildGvcnReport(ds: LevelDataset, classCode: string, period: Period, today: string): GvcnReport {
  const scope: GlobalFilters = { period, classCode };
  const classInfo = ds.classes.find((c) => c.code === classCode);
  const roster = rosterNames(ds.students);
  const incidents = [...filterIncidents(ds, scope)].sort((a, b) => compareIncidentsNewestFirst(b, a)).map((i) => withRosterNames(i, roster));
  const { current, previous } = kpiComparison(ds, scope);
  // `grade` only trims the per-khối tables (ignored for a level-wide ranking: THPT ranks every class together).
  const ranking = classInfo
    ? findRankingRow(buildRanking(ds, period, today, { highlightClass: classCode, grade: classInfo.grade }), classCode)
    : undefined;
  const students = [...studentStats(ds, scope, today)].sort((a, b) => ALERT_ORDER[a.alert] - ALERT_ORDER[b.alert]);
  const rewards = [...filterRewards(ds, scope)].sort((a, b) => b.date.localeCompare(a.date) || naturalCompare(b.code, a.code));
  const report: GvcnReport = {
    classCode,
    activeStudents: ds.students.filter((s) => s.classCode === classCode && s.status === "ACTIVE").length,
    period,
    scope,
    incidents,
    kpis: current,
    rankLabel: reportRankLabel(ds.levelId, classInfo?.grade),
    rankHint: rankRuleHint(ds.levelId),
    students,
    rewards,
    countedStatuses: ds.config.rewardCountedStatuses,
    topRatio: ds.config.top90Ratio,
  };
  if (classInfo) report.classInfo = classInfo;
  if (previous) report.previous = previous;
  if (ranking) report.ranking = ranking;
  return report;
}

/** "Hạng khối 6" (one ranking per khối) | "Hạng toàn cấp" (THPT: one ranking for the level) | "Hạng khối" (unknown class). */
export function reportRankLabel(levelId: LevelId, grade?: number): string {
  if (rankingRuleOf(levelId).scope === "level") return "Hạng toàn cấp";
  return grade ? `Hạng khối ${grade}` : "Hạng khối";
}

/**
 * Global filters the class report does not apply (Mảng / Lỗi / Nhóm lỗi / Học sinh): the report always covers every
 * incident of the class in the period, like the official score and rank. Labels for the notice, e.g.
 * ["Mảng: Vệ sinh", "Lỗi L01 – Đi học muộn", "Nhóm lỗi: Nhóm 3", "Học sinh: Nguyễn Văn A (HS0001)"]; [] when none is set.
 */
export function ignoredReportFilters(
  f: Pick<GlobalFilters, "category" | "errorCode" | "group" | "studentId">,
  catalog: readonly Pick<CatalogItem, "code" | "issue">[],
  students: readonly Pick<StudentLite, "id" | "name">[] = [],
): string[] {
  const out: string[] = [];
  if (f.category) out.push(`Mảng: ${f.category}`);
  if (f.errorCode) {
    const issue = catalog.find((c) => c.code === f.errorCode)?.issue;
    out.push(issue ? `Lỗi ${f.errorCode} – ${issue}` : `Lỗi ${f.errorCode}`);
  }
  if (f.group) out.push(`Nhóm lỗi: ${f.group}`);
  if (f.studentId) {
    const name = students.find((s) => s.id === f.studentId)?.name;
    out.push(name ? `Học sinh: ${name} (${f.studentId})` : `Học sinh: ${f.studentId}`);
  }
  return out;
}

/** "so với tuần trước" / "so với tháng trước" / "so với học kỳ trước". */
export function previousLabelShort(mode: PeriodMode): string | undefined {
  if (mode === "week") return "so với tuần trước";
  if (mode === "month") return "so với tháng trước";
  if (mode === "semester") return "so với học kỳ trước";
  return undefined;
}

/* ---------------------------------- labels --------------------------------- */

const SHORT_WEEKDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** "T2" … "T7", "CN". */
export function shortWeekday(date: string): string {
  return SHORT_WEEKDAY[weekdayIndex(date)];
}

export interface Subject {
  names: string[];
  unnamed: number;
  /** Students counted but hidden from this viewer (redacted datasets). */
  hidden: number;
  /** No student at all → the whole class ("Tập thể lớp", AC-013). */
  collective: boolean;
}

/** Who an incident is about; names from `roster` when given (report incidents already carry roster names). */
export function subjectOf(i: Pick<Incident, "students" | "unnamedCount" | "relatedStudentCount">, roster?: RosterNames): Subject {
  const names = i.students.map((s) => studentDisplayName(s, roster));
  const unnamed = Math.max(0, i.unnamedCount);
  const hidden = Math.max(0, i.relatedStudentCount - names.length - unnamed);
  return { names, unnamed, hidden, collective: names.length + unnamed + hidden === 0 };
}

/** "Nguyễn Văn A, Trần An + 2 HS chưa rõ tên" · "3 HS chưa rõ tên" · "Tập thể lớp". */
export function subjectText(i: Pick<Incident, "students" | "unnamedCount" | "relatedStudentCount">, roster?: RosterNames): string {
  const s = subjectOf(i, roster);
  if (s.collective) return "Tập thể lớp";
  const parts: string[] = [];
  if (s.names.length) parts.push(s.names.join(", "));
  if (s.hidden) parts.push(`${s.hidden} HS`);
  if (s.unnamed) parts.push(`${s.unnamed} HS chưa rõ tên`);
  return parts.join(" + ");
}

/* --------------------------------- filtering -------------------------------- */

export type StatusFilter = "ALL" | IncidentStatus;

function searchText(i: Incident): string {
  return [i.code, i.errorCode, i.issue, i.category, subjectText(i), i.students.map((s) => s.id).join(" "), i.detail, i.gvcnNote, i.remediation, i.reporter]
    .filter(Boolean)
    .join(" ");
}

/** Accent-insensitive search (engine matchesSearch) + status filter, order kept. */
export function filterReportRows(incidents: readonly Incident[], f: { query: string; status: StatusFilter }): Incident[] {
  return incidents.filter((i) => (f.status === "ALL" || i.status === f.status) && matchesSearch(searchText(i), f.query));
}

export function statusCounts(incidents: readonly Incident[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { ALL: incidents.length, "Mới ghi nhận": 0, "Đang xử lý": 0, "Đã đóng": 0 };
  for (const i of incidents) counts[i.status] += 1;
  return counts;
}

/* --------------------------------- feedback -------------------------------- */

/**
 * Only the changed fields the viewer may send (`rights`, default: GVCN note + status + remediation); null when nothing
 * changed (the API rejects an empty body). `remediation` undefined = the field is not on the form.
 */
export function feedbackPayload(
  incident: Pick<Incident, "gvcnNote" | "status" | "remediation">,
  note: string,
  status: IncidentStatus,
  remediation?: string,
  rights?: FeedbackRights,
): GvcnFeedbackInput | null {
  return feedbackChanges(incident, { note, status, remediation }, rights);
}

/**
 * Dialog of a row: "gvcn" = phản hồi GVCN + biện pháp khắc phục + trạng thái (class GVCN, ADMIN); "remediate" = biện
 * pháp khắc phục + trạng thái (EDITOR with incident.remediate); undefined = read only.
 */
export type FeedbackMode = "gvcn" | "remediate";

export function feedbackModeOf(rights: FeedbackRights): FeedbackMode | undefined {
  if (rights.note) return "gvcn";
  return rights.remediation ? "remediate" : undefined;
}

/** Rights of a dialog mode (what feedbackPayload may send). */
export function rightsOfMode(mode: FeedbackMode): FeedbackRights {
  return mode === "gvcn" ? { note: true, status: true, remediation: true } : { note: false, status: true, remediation: true };
}

/** Reward counted in the score (status in config.rewardCountedStatuses). */
export function isRewardCounted(r: Pick<Reward, "status">, counted: readonly RewardStatus[]): boolean {
  return counted.includes(r.status);
}
