/**
 * Báo cáo tuần/tháng (REQ_V2 §6.5) – pure view model: recipients per role, URL parsing (`to`, `detail`, week|month
 * period) and the report content of one recipient. Every number comes from the engine; this file only scopes,
 * selects and labels. Unit-tested in __tests__/report-model.test.ts.
 */
import { scopeWarningsForViewer } from "@/components/dashboard/lib/warning-model";
import { KPI_TERMS, LEVELS, type KpiTermId } from "@/lib/constants";
import {
  buildRanking,
  compareIncidentsNewestFirst,
  earlyWarnings,
  filterIncidents,
  findRankingGroup,
  findRankingRow,
  formatDateVN,
  groupBreakdown,
  groupByScoreBand,
  kpiComparison,
  LEVEL_RANKING_GROUP,
  naturalCompare,
  periodLabel,
  previousPeriod,
  rankingGroupLabel,
  rankingRuleOf,
  round2,
  SCORE_BAND_RULES,
  topIssues,
  namedTop,
  violationTurnsOf,
  type EarlyWarning,
  type GroupStat,
  type IssueStat,
  type Kpis,
  type PeriodOption,
  type RankingRule,
  type ScoreBand,
  type ScoreBandRule,
} from "@/lib/engine";
import type { ClassInfo, GlobalFilters, GradeRanking, Incident, IncidentStatus, LevelDataset, LevelId, Period, RankingRow, Scope, UserProfile } from "@/lib/types";

/* -------------------------------- Recipients ------------------------------ */

export type Recipient = { kind: "bgh" } | { kind: "grade"; grade: number } | { kind: "class"; classCode: string };

/** URL value of `?to=`: "bgh" | "khoi-6" | "lop-6A01". */
export function recipientKey(r: Recipient): string {
  if (r.kind === "bgh") return "bgh";
  if (r.kind === "grade") return `khoi-${r.grade}`;
  return `lop-${r.classCode}`;
}

/** Syntax-only parse of `?to=` (whether the viewer may use it is decided by `resolveRecipient`). */
export function parseRecipient(raw: string | null | undefined): Recipient | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (v === "bgh") return { kind: "bgh" };
  const grade = /^khoi-(\d{1,2})$/.exec(v);
  if (grade) return { kind: "grade", grade: Number(grade[1]) };
  const cls = /^lop-([\w.-]{1,20})$/.exec(v);
  if (cls) return { kind: "class", classCode: cls[1] };
  return undefined;
}

export interface RecipientOption {
  key: string;
  recipient: Recipient;
  /** "Ban Giám hiệu – Trung học cơ sở" | "Tổ khối 6" | "GVCN lớp 6A01". */
  label: string;
  /** Select group. */
  group: string;
}

type Viewer = Pick<UserProfile, "role" | "gvcnClasses"> | undefined;

const compareClasses = (a: Pick<ClassInfo, "grade" | "order" | "code">, b: Pick<ClassInfo, "grade" | "order" | "code">) =>
  a.grade - b.grade || a.order - b.order || naturalCompare(a.code, b.code);

/** Own classes of a GVCN in the level (codes of the dataset), class display order. */
export function ownReportClasses(profile: Viewer, ds: Pick<LevelDataset, "levelId" | "classes">): string[] {
  if (!profile || profile.role !== "GVCN") return [];
  const own = new Set(profile.gvcnClasses.filter((c) => c.levelId === ds.levelId).map((c) => c.classCode));
  return ds.classes
    .filter((c) => own.has(c.code))
    .sort(compareClasses)
    .map((c) => c.code);
}

const classOption = (code: string): RecipientOption => ({
  key: recipientKey({ kind: "class", classCode: code }),
  recipient: { kind: "class", classCode: code },
  label: `GVCN lớp ${code}`,
  group: "Giáo viên chủ nhiệm",
});

/**
 * Recipients the viewer may address. ADMIN / EDITOR / VIEWER: "Ban Giám hiệu – {cấp}", "Tổ khối N" (grades with active
 * classes) and "GVCN lớp X" (active classes). GVCN: only their own classes (role-filtered datasets hold nothing else).
 */
export function recipientOptions(profile: Viewer, ds: Pick<LevelDataset, "levelId" | "classes">): RecipientOption[] {
  if (profile?.role === "GVCN") return ownReportClasses(profile, ds).map(classOption);
  const active = ds.classes.filter((c) => c.active).sort(compareClasses);
  const grades = [...new Set(active.map((c) => c.grade))].sort((a, b) => a - b);
  return [
    { key: "bgh", recipient: { kind: "bgh" }, label: `Ban Giám hiệu – ${LEVELS[ds.levelId].name}`, group: "Ban Giám hiệu" },
    ...grades.map((g) => ({ key: recipientKey({ kind: "grade", grade: g }), recipient: { kind: "grade" as const, grade: g }, label: `Tổ khối ${g}`, group: "Tổ khối" })),
    ...active.map((c) => classOption(c.code)),
  ];
}

/**
 * The recipient of `?to=` when the viewer may use it; otherwise the first option (BGH for school staff, the first own
 * class for a GVCN). undefined when the viewer has no option at all.
 */
export function resolveRecipient(raw: string | null | undefined, options: readonly RecipientOption[]): RecipientOption | undefined {
  const parsed = parseRecipient(raw);
  const key = parsed ? recipientKey(parsed) : undefined;
  return (key ? options.find((o) => o.key === key) : undefined) ?? options[0];
}

/** `?detail=1|0`; default: on for a grade / class, off for BGH (long). */
export function parseDetail(raw: string | null | undefined, recipient: Recipient): boolean {
  const v = raw?.trim();
  if (v === "1") return true;
  if (v === "0") return false;
  return recipient.kind !== "bgh";
}

/* ---------------------------------- Period -------------------------------- */

export type ReportMode = "week" | "month";

export const REPORT_MODES: ReadonlyArray<{ value: ReportMode; label: string }> = [
  { value: "week", label: "Tuần" },
  { value: "month", label: "Tháng" },
];

/** Default key of a mode: the current option, else the last past one, else the first. */
function defaultKey(options: readonly PeriodOption[]): string | undefined {
  const current = options.find((o) => o.isCurrent);
  if (current) return current.key;
  const past = options.filter((o) => !o.isFuture);
  return (past.length ? past[past.length - 1] : options[0])?.key;
}

/**
 * Report period from the global filter period: week / month are kept (key already validated by useFilters); a
 * semester / whole-year period is coerced to the current week. undefined when the calendar has no week.
 */
export function reportPeriod(period: Period, options: { weeks: readonly PeriodOption[]; months: readonly PeriodOption[] }): Period | undefined {
  if ((period.mode === "week" || period.mode === "month") && period.key) return { mode: period.mode, key: period.key };
  const key = defaultKey(options.weeks);
  return key ? { mode: "week", key } : undefined;
}

/* --------------------------------- Content -------------------------------- */

/** Global filters of a recipient: BGH = whole level, khối = grade, lớp = class. */
export function recipientFilters(recipient: Recipient, period: Period): GlobalFilters {
  if (recipient.kind === "grade") return { period, grade: recipient.grade };
  if (recipient.kind === "class") return { period, classCode: recipient.classCode };
  return { period };
}

export type ReportKpiId = Exclude<KpiTermId, "relatedStudents">;

export interface ReportKpi {
  id: ReportKpiId;
  label: string;
  hint: string;
  value: number;
  previous?: number;
  /** value − previous (undefined without a previous period). */
  delta?: number;
  goodWhen: "up" | "down";
}

const KPI_FIELDS: ReadonlyArray<{ id: ReportKpiId; field: keyof Kpis; goodWhen: "up" | "down" }> = [
  { id: "incidents", field: "incidents", goodWhen: "down" },
  { id: "violationTurns", field: "violationTurns", goodWhen: "down" },
  { id: "uniqueStudents", field: "uniqueStudents", goodWhen: "down" },
  { id: "penaltyPoints", field: "penaltyPoints", goodWhen: "down" },
  { id: "rewardPoints", field: "rewardPoints", goodWhen: "up" },
];

/** The 4 vocabulary numbers (KPI_TERMS) + Điểm thưởng, with the delta vs the previous period. */
export function reportKpis(current: Kpis, previous?: Kpis): ReportKpi[] {
  return KPI_FIELDS.map(({ id, field, goodWhen }) => {
    const value = current[field];
    const prev = previous?.[field];
    return {
      id,
      label: KPI_TERMS[id].label,
      hint: KPI_TERMS[id].hint,
      value,
      previous: prev,
      delta: prev === undefined ? undefined : round2(value - prev),
      goodWhen,
    };
  });
}

export interface ReportGradeRanking {
  /** Grade of the rows; LEVEL_RANKING_GROUP (0) for the whole level ranked as one table (THPT, BGH / GVCN). */
  grade: number;
  /** "Khối 6" | "Toàn cấp" (rankingGroupLabel of `grade`). */
  label: string;
  /** Ranking rule of the level (scope "level": ranks are level-wide even when `rows` are one khối). */
  rule: RankingRule;
  /** Classes of `rows`. */
  classCount: number;
  /** Classes of the ranking group the ranks are out of (= classCount, or the whole level for a THPT khối). */
  rankCount: number;
  /** Mean score of `rows`. */
  avgScore: number;
  /** Last rank inside Top 90% (of the ranking group). */
  cutoff: number;
  rows: RankingRow[];
  /**
   * Heading of `leaders`: "Top 3" when the rule names the first N classes (THPT), else "Dẫn đầu". Leaders come from the
   * whole ranking group (a THPT khối lists the Top 3 of the level).
   */
  leadersLabel: string;
  /**
   * rule.topCount (THPT): first N classes, ties at the cut included ([] when the period counts no week); score bands
   * (THCS): every class at rank 1; else up to 3.
   */
  leaders: RankingRow[];
  /** Top N (THPT): every class of the level shares the same rank – write "tất cả N lớp đồng hạng" instead of a list. */
  leadersAllTied?: boolean;
  /** Classes of `rows` outside Top 90%. */
  outside: RankingRow[];
  /** Classes of `rows` at RAG RED. */
  red: RankingRow[];
  /**
   * Levels with SCORE_BAND_RULES (THCS): Dẫn đầu · Top >90% · Top 51%–90% · Top <51%. `groups` / `perWeek` (base points
   * of one week) are undefined when the period counts no week (holiday / future): no band then.
   */
  bands?: { rule: ScoreBandRule; groups?: Record<ScoreBand, RankingRow[]>; perWeek?: number };
}

export interface ReportClassStanding {
  row: RankingRow;
  previousRank?: number;
  /** The ranking group of the class (its khối, or the whole level for THPT). */
  grade: ReportGradeRanking;
}

export type ReportRanking = { countedWeeks: number; rule: RankingRule } & (
  | { kind: "level"; grades: ReportGradeRanking[] }
  | { kind: "grade"; grade?: ReportGradeRanking }
  | { kind: "class"; standing?: ReportClassStanding }
);

/**
 * Report view of one engine ranking group. `onlyGrade` keeps the classes of one khối of a level-wide group (THPT tổ
 * khối) with their level ranks; leaders / cutoff stay those of the whole group.
 */
function gradeRanking(group: GradeRanking, rule: RankingRule, bandRule?: ScoreBandRule, onlyGrade?: number): ReportGradeRanking {
  const all = group.rows;
  const sub = onlyGrade !== undefined && group.grade === LEVEL_RANKING_GROUP;
  const rows = sub ? all.filter((r) => r.grade === onlyGrade) : all;
  const grade = sub ? onlyGrade : group.grade;
  const count = rows.length;
  const counted = rows.find((r) => r.base > 0 && r.countedWeeks > 0);
  const groups = bandRule && counted ? groupByScoreBand(rows, bandRule) : undefined;
  const top = bandRule ? undefined : rule.topCount;
  // Top N (THPT): the shared engine rule – nothing without a counted week, "all tied" when the tie covers the level.
  const named = top !== undefined ? namedTop(all, top) : undefined;
  return {
    grade,
    label: rankingGroupLabel(grade),
    rule,
    classCount: count,
    rankCount: all.length,
    avgScore: count ? round2(rows.reduce((a, r) => a + r.score, 0) / count) : 0,
    cutoff: all[0]?.top90Cutoff ?? 0,
    rows,
    leadersLabel: top !== undefined ? `Top ${top}` : "Dẫn đầu",
    leaders: bandRule ? all.filter((r) => r.rank === 1) : named ? named.rows : all.slice(0, 3),
    ...(named?.allTied ? { leadersAllTied: true } : {}),
    outside: rows.filter((r) => !r.inTop90),
    red: rows.filter((r) => r.rag === "RED"),
    ...(bandRule ? { bands: { rule: bandRule, groups, perWeek: counted ? round2(counted.base / counted.countedWeeks) : undefined } } : {}),
  };
}

/**
 * How ranks are computed, for the note under "Xếp hạng thi đua": "thứ hạng tính trên toàn bộ lớp của khối" | THPT:
 * "… của cấp; bằng điểm: ít lượt vi phạm xếp trên, …; Top 3 gồm cả các lớp đồng hạng".
 */
export function rankingRuleNote(rule: RankingRule): string {
  const parts = [`thứ hạng tính trên toàn bộ lớp của ${rule.scope === "level" ? "cấp" : "khối"}`];
  if (rule.tieBreak === "violationTurns") parts.push("bằng điểm: ít lượt vi phạm xếp trên, bằng cả số lượt: đồng hạng");
  if (rule.topCount !== undefined) parts.push(`Top ${rule.topCount} gồm cả các lớp đồng hạng`);
  return parts.join("; ");
}

export interface ReportDetailRow {
  id: string;
  /** yyyy-mm-dd (sort key). */
  isoDate: string;
  /** dd/mm/yyyy. */
  date: string;
  code: string;
  classCode: string;
  errorCode: string;
  issue: string;
  group: string;
  scope: Scope;
  /** "Nguyễn Văn A, Trần Thị B + 2 HS chưa rõ tên" | "Tập thể lớp" | "3 HS (ẩn danh)". */
  subjects: string;
  /** Mã HS of the named students, comma separated ("" when none). */
  studentIds: string;
  turns: number;
  points: number;
  status: IncidentStatus;
  remediation: string;
  gvcnNote: string;
}

/** Who an incident is about, as one line (names hidden on redacted incidents). */
export function subjectsText(i: Pick<Incident, "students" | "unnamedCount" | "relatedStudentCount">): string {
  const names = [...new Map(i.students.map((s) => [s.id, s.name] as const)).values()];
  if (names.length === 0 && i.unnamedCount === 0) {
    return i.relatedStudentCount > 0 ? `${i.relatedStudentCount} HS (ẩn danh)` : "Tập thể lớp";
  }
  const unnamed = i.unnamedCount > 0 ? `${i.unnamedCount} HS chưa rõ tên` : "";
  if (names.length === 0) return unnamed;
  return unnamed ? `${names.join(", ")} + ${unnamed}` : names.join(", ");
}

/** Detail rows of the scope, sorted by date then code (ascending, like a register). */
export function detailRows(incidents: readonly Incident[]): ReportDetailRow[] {
  return [...incidents]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : naturalCompare(a.code, b.code)))
    .map((i) => ({
      id: i.id,
      isoDate: i.date,
      date: formatDateVN(i.date),
      code: i.code,
      classCode: i.classCode,
      errorCode: i.errorCode,
      issue: i.issue,
      group: i.group?.trim() || "",
      scope: i.scope,
      subjects: subjectsText(i),
      studentIds: [...new Set(i.students.map((s) => s.id))].join(", "),
      turns: violationTurnsOf(i),
      points: i.points,
      status: i.status,
      remediation: i.remediation?.trim() ?? "",
      gvcnNote: i.gvcnNote?.trim() ?? "",
    }));
}

export interface PeriodReport {
  levelId: LevelId;
  levelName: string;
  period: Period;
  periodLabel: string;
  /** "BÁO CÁO NỀN NẾP TUẦN 12/10 – 18/10/2026" / "BÁO CÁO NỀN NẾP THÁNG 10/2026". */
  title: string;
  recipient: Recipient;
  recipientKey: string;
  /** "Ban Giám hiệu – Trung học cơ sở" | "Tổ khối 6" | "GVCN lớp 6A01 – thầy/cô …". */
  addressee: string;
  /** Short scope label for files / headings: "Toàn cấp" | "Khối 6" | "Lớp 6A01". */
  scopeLabel: string;
  filters: GlobalFilters;
  previousLabel?: string;
  kpis: ReportKpi[];
  ranking: ReportRanking;
  topIssues: IssueStat[];
  /** Groups with incidents (catalog order, "Chưa phân nhóm" last). */
  groups: GroupStat[];
  warnings: EarlyWarning[];
  detail: ReportDetailRow[];
  hasData: boolean;
}

/** Content of the report of one recipient and period. `viewer` restricts warnings for a GVCN (own classes). */
export function buildPeriodReport(
  ds: LevelDataset,
  args: { period: Period; recipient: Recipient; viewer?: Viewer },
  today: string,
): PeriodReport {
  const { period, recipient } = args;
  const filters = recipientFilters(recipient, period);
  const label = periodLabel(period, ds.config.semesters);
  const levelName = LEVELS[ds.levelId].name;
  const cls = recipient.kind === "class" ? ds.classes.find((c) => c.code === recipient.classCode) : undefined;

  const { current, previous, previousLabel } = kpiComparison(ds, filters);
  const incidents = filterIncidents(ds, filters);

  const ranking = buildRanking(ds, period, today);
  const rule = rankingRuleOf(ds.levelId);
  const bandRule = SCORE_BAND_RULES[ds.levelId];
  const common = { countedWeeks: ranking.countedWeeks, rule };
  let reportRanking: ReportRanking;
  if (recipient.kind === "bgh") {
    reportRanking = { ...common, kind: "level", grades: ranking.grades.map((g) => gradeRanking(g, rule, bandRule)) };
  } else if (recipient.kind === "grade") {
    // THPT: the khối's classes inside the single level table, with their level ranks.
    const group = ranking.grades.find((g) => g.grade === (rule.scope === "level" ? LEVEL_RANKING_GROUP : recipient.grade));
    const view = group ? gradeRanking(group, rule, bandRule, recipient.grade) : undefined;
    reportRanking = { ...common, kind: "grade", grade: view?.rows.length ? view : undefined };
  } else {
    const group = findRankingGroup(ranking, recipient.classCode);
    const row = group?.rows.find((r) => r.classCode === recipient.classCode);
    const prev = previousPeriod(period, ds.weeks, ds.config.semesters);
    const previousRank = prev && row ? findRankingRow(buildRanking(ds, prev, today), row.classCode)?.rank : undefined;
    reportRanking = { ...common, kind: "class", standing: row && group ? { row, previousRank, grade: gradeRanking(group, rule, bandRule) } : undefined };
  }

  const warnings = scopeWarningsForViewer(earlyWarnings(ds, filters, today), args.viewer, ds.levelId);
  const groups = groupBreakdown(incidents, ds.catalog).filter((g) => g.incidents > 0);
  const homeroom = cls?.homeroomTeacher?.trim();

  return {
    levelId: ds.levelId,
    levelName,
    period,
    periodLabel: label,
    title: `BÁO CÁO NỀN NẾP ${label.toLocaleUpperCase("vi-VN")}`,
    recipient,
    recipientKey: recipientKey(recipient),
    addressee:
      recipient.kind === "bgh"
        ? `Ban Giám hiệu – ${levelName}`
        : recipient.kind === "grade"
          ? `Tổ khối ${recipient.grade}`
          : `GVCN lớp ${recipient.classCode}${homeroom ? ` – thầy/cô ${homeroom}` : ""}`,
    scopeLabel: recipient.kind === "bgh" ? "Toàn cấp" : recipient.kind === "grade" ? `Khối ${recipient.grade}` : `Lớp ${recipient.classCode}`,
    filters,
    previousLabel,
    kpis: reportKpis(current, previous),
    ranking: reportRanking,
    topIssues: topIssues(incidents, 5),
    groups,
    warnings,
    detail: detailRows(incidents),
    hasData: incidents.length > 0 || current.rewardPoints > 0,
  };
}

/** Newest-first incidents of the report (for drill-downs). */
export function reportIncidents(ds: LevelDataset, report: Pick<PeriodReport, "filters">): Incident[] {
  return filterIncidents(ds, report.filters).sort(compareIncidentsNewestFirst);
}

/** Bar width ratio (0–1) of each group against the largest one, by penalty points. */
export function groupShares(groups: readonly GroupStat[]): number[] {
  const max = Math.max(0, ...groups.map((g) => g.points));
  return groups.map((g) => (max > 0 ? g.points / max : 0));
}
