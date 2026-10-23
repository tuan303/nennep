/**
 * Pure view-model helpers of the "Khối & lớp" screen. Scores, ranks, RAG and KPIs come from the engine; these helpers
 * only shape engine output (and redacted datasets) for display.
 */
import {
  formatDayMonthVN,
  LEVEL_RANKING_GROUP,
  rankingGroupLabel,
  rankingRuleOf,
  round2,
  type CumulativePenalty,
  type TimelineDay,
} from "@/lib/engine";
import type { ClassInfo, GlobalFilters, GradeRanking, Incident, LevelDataset, LevelId, RankingRow, StudentRef } from "@/lib/types";

export interface ClassSize {
  /** Number shown as "Sĩ số"; undefined when unknown. */
  value?: number;
  /** roster = active students of the dataset; source = ClassInfo.sourceSize (imported list); hidden = no access. */
  source: "roster" | "source" | "hidden" | "none";
}

/**
 * Sĩ số: active students of the class in the dataset. GVCN viewing another class receive no students → fall back to the
 * size from the imported class list (or "hidden").
 */
export function classSize(ds: Pick<LevelDataset, "students">, cls: Pick<ClassInfo, "code" | "sourceSize">, canSeeDetail: boolean): ClassSize {
  if (canSeeDetail) {
    const active = ds.students.filter((s) => s.classCode === cls.code && s.status === "ACTIVE").length;
    if (active > 0) return { value: active, source: "roster" };
    return cls.sourceSize ? { value: cls.sourceSize, source: "source" } : { source: "none" };
  }
  return cls.sourceSize ? { value: cls.sourceSize, source: "source" } : { source: "hidden" };
}

export interface SubjectsView {
  /** Named students (deduplicated), empty when hidden. */
  named: StudentRef[];
  /** Students counted without a name ("/HS" + Tập thể). */
  unnamed: number;
  /** Redacted incident: number of students involved, names hidden. */
  hiddenCount: number;
  /** No student at all → "Tập thể lớp". */
  collective: boolean;
}

/** Who an incident is about, honouring GVCN redaction (names stripped for other classes). */
export function incidentSubjects(i: Pick<Incident, "students" | "unnamedCount" | "relatedStudentCount">, hidden: boolean): SubjectsView {
  if (hidden) {
    return { named: [], unnamed: 0, hiddenCount: i.relatedStudentCount, collective: i.relatedStudentCount === 0 };
  }
  const seen = new Set<string>();
  const named = i.students.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  return { named, unnamed: i.unnamedCount, hiddenCount: 0, collective: named.length === 0 && i.unnamedCount === 0 };
}

/** Incident filters of the page that narrow the class detail (everything except period / grade / class). */
export type IssueFilters = Pick<GlobalFilters, "category" | "errorCode" | "group" | "studentId">;

/** Scope of the class detail: the period + the class + every incident filter of the page (Mảng, lỗi, nhóm lỗi, HS). */
export function classScope(f: GlobalFilters, classCode: string): GlobalFilters {
  const out: GlobalFilters = { period: f.period, classCode };
  if (f.category) out.category = f.category;
  if (f.errorCode) out.errorCode = f.errorCode;
  if (f.group) out.group = f.group;
  if (f.studentId) out.studentId = f.studentId;
  return out;
}

/** "mảng “X” và nhóm lỗi Nhóm 3 và học sinh HS0001" – active incident filters as text (undefined when none). */
export function issueFilterText(f: IssueFilters, studentName?: string): string | undefined {
  const parts = [
    f.category ? `mảng “${f.category}”` : "",
    f.group ? `nhóm lỗi “${f.group}”` : "",
    f.errorCode ? `lỗi ${f.errorCode}` : "",
    f.studentId ? `học sinh ${studentName ?? f.studentId}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/**
 * Apply the incident filters of the page (Mảng, lỗi, nhóm lỗi, học sinh) to an engine timeline: items outside the
 * filters are dropped, empty days removed and the day totals summed again from the remaining incidents.
 */
export function filterTimelineDays(days: TimelineDay[], f: IssueFilters): TimelineDay[] {
  if (!f.category && !f.errorCode && !f.group && !f.studentId) return days;
  const out: TimelineDay[] = [];
  for (const d of days) {
    const items = d.items.filter(
      (i) =>
        (!f.category || i.category === f.category) &&
        (!f.errorCode || i.errorCode === f.errorCode) &&
        (!f.group || i.group === f.group) &&
        (!f.studentId || i.students.some((s) => s.id === f.studentId)),
    );
    if (items.length) out.push({ ...d, items, points: items.reduce((a, i) => a + i.points, 0) });
  }
  return out;
}

export function timelineTotals(days: TimelineDay[]): { days: number; incidents: number; points: number } {
  let incidents = 0;
  let points = 0;
  for (const d of days) {
    incidents += d.items.length;
    points += d.points;
  }
  return { days: days.length, incidents, points };
}

export interface ScoreChartData {
  categories: string[];
  score: number[];
  penalty: number[];
  reward: number[];
  rank: number[];
}

/** Engine classScoreSeries → LineChart inputs (x labels "dd/mm" of each Monday). */
export function scoreChartData(
  series: ReadonlyArray<{ week: string; score: number; penalty: number; reward: number; rank: number }>,
): ScoreChartData {
  return {
    categories: series.map((p) => formatDayMonthVN(p.week)),
    score: series.map((p) => p.score),
    penalty: series.map((p) => p.penalty),
    reward: series.map((p) => p.reward),
    rank: series.map((p) => p.rank),
  };
}

/** Last `n` values (for KPI sparklines). */
export function lastValues(values: readonly number[], n = 10): number[] {
  return values.slice(Math.max(0, values.length - n));
}

export interface ContactLink {
  kind: "phone" | "email";
  label: string;
  href: string;
}

/** Phone / e-mail links of the homeroom teacher (only when present and plausible). */
export function classContacts(cls: Pick<ClassInfo, "homeroomPhone" | "homeroomEmail">): ContactLink[] {
  const out: ContactLink[] = [];
  const phone = cls.homeroomPhone?.trim();
  if (phone) {
    const digits = phone.replace(/[^\d+]/g, "");
    if (digits.replace(/\D/g, "").length >= 8) out.push({ kind: "phone", label: phone, href: `tel:${digits}` });
  }
  const email = cls.homeroomEmail?.trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push({ kind: "email", label: email, href: `mailto:${email}` });
  return out;
}

/** Leading grade number of a class code ("10A1" → 10, "6A03" → 6); undefined when the code has none. */
export function gradeFromCode(code: string): number | undefined {
  const m = /^(\d{1,2})/.exec(code.trim());
  return m ? Number(m[1]) : undefined;
}

/** Donut slices: non-zero values sorted desc; everything after `max - 1` slices folded into "Khác". */
export function foldSlices(items: ReadonlyArray<{ name: string; value: number }>, max = 7): Array<{ name: string; value: number }> {
  const sorted = items.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((a, d) => a + d.value, 0);
  return [...head, { name: "Khác", value: rest }];
}

export interface ClassVsGrade {
  /** Cumulative penalty of the class up to the last week. */
  classValue: number;
  /** Cumulative penalty of the grade average (TB khối) up to the last week; undefined without such a series. */
  avgValue?: number;
  /** classValue − avgValue (undefined without average). */
  diff?: number;
}

/** Last values of the class series (`class:CODE`) and of its grade average (`avg:N`) of `cumulativePenalty`. */
export function classVsGrade(cp: CumulativePenalty, classCode: string, grade: number): ClassVsGrade {
  const last = (key: string) => {
    const s = cp.series.find((x) => x.key === key);
    return s && s.values.length ? s.values[s.values.length - 1] : undefined;
  };
  const classValue = last(`class:${classCode}`) ?? 0;
  const avgValue = last(`avg:${grade}`);
  return { classValue, avgValue, diff: avgValue === undefined ? undefined : round2(classValue - avgValue) };
}

/** "Cao hơn TB khối 3,5 điểm" / "Thấp hơn TB khối 2 điểm" / "Bằng TB khối". */
export function classVsGradeText(v: ClassVsGrade, fmt: (n: number) => string): string | undefined {
  if (v.diff === undefined) return undefined;
  if (v.diff === 0) return "Bằng trung bình khối";
  return `${v.diff > 0 ? "Cao hơn" : "Thấp hơn"} trung bình khối ${fmt(Math.abs(v.diff))} điểm`;
}

/* ------------------------------ ranking wording ----------------------------- */

/**
 * Where a class is ranked (RankingRule of the level): "trong khối 6" (one table per khối) | "toàn cấp" (THPT: one table
 * for the whole level). Without `grade`: "trong khối".
 */
export function rankScopeText(levelId: LevelId, grade?: number): string {
  if (rankingRuleOf(levelId).scope === "level") return "toàn cấp";
  return typeof grade === "number" ? `trong khối ${grade}` : "trong khối";
}

/** Tooltip: how the classes of the level are ranked (population + tie-break). */
export function rankRuleHint(levelId: LevelId): string {
  const rule = rankingRuleOf(levelId);
  const scope = rule.scope === "level" ? "Xếp hạng chung toàn cấp theo điểm thi đua" : "Xếp hạng theo điểm thi đua trong các lớp cùng khối";
  const ties =
    rule.tieBreak === "violationTurns"
      ? "bằng điểm thì lớp ít lượt vi phạm hơn xếp trên, bằng cả điểm và lượt vi phạm thì đồng hạng"
      : "bằng điểm thì đồng hạng";
  return `${scope}; ${ties}.`;
}

export interface OverviewSection {
  key: string;
  title: string;
  description: string;
  rows: RankingRow[];
}

/**
 * Tile sections of the overview, one per ranking table, rows in rank order. A level-wide table (THPT) is one "Toàn cấp"
 * section; a khối filter keeps only that khối's classes there, with their level-wide ranks (BR-RANK-06: the filter never
 * changes the population). Sections without classes are dropped.
 */
export function overviewSections(grades: readonly GradeRanking[], grade?: number): OverviewSection[] {
  const out: OverviewSection[] = [];
  for (const g of grades) {
    const levelWide = g.grade === LEVEL_RANKING_GROUP;
    const rows = levelWide && typeof grade === "number" ? g.rows.filter((r) => r.grade === grade) : g.rows;
    if (rows.length === 0) continue;
    const partial = rows.length < g.rows.length;
    const order = !levelWide
      ? "sắp xếp theo hạng thi đua"
      : partial
        ? `sắp xếp theo hạng thi đua toàn cấp (${g.rows.length} lớp)`
        : "sắp xếp theo hạng thi đua toàn cấp";
    out.push({
      key: String(g.grade),
      title: levelWide && partial ? `Khối ${grade}` : rankingGroupLabel(g.grade),
      description: `${rows.length} lớp · ${order}`,
      rows,
    });
  }
  return out;
}
