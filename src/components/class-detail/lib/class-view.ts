/**
 * Pure view-model helpers of the "Khối & lớp" screen. Scores, ranks, RAG and KPIs come from the engine; these helpers
 * only shape engine output (and redacted datasets) for display.
 */
import { formatDayMonthVN, type TimelineDay } from "@/lib/engine";
import type { ClassInfo, Incident, LevelDataset, StudentRef } from "@/lib/types";

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

/**
 * Apply the category / error filters of the page to an engine timeline: items outside the filters are dropped,
 * empty days removed and the day totals summed again from the remaining incidents.
 */
export function filterTimelineDays(days: TimelineDay[], f: { category?: string; errorCode?: string }): TimelineDay[] {
  if (!f.category && !f.errorCode) return days;
  const out: TimelineDay[] = [];
  for (const d of days) {
    const items = d.items.filter((i) => (!f.category || i.category === f.category) && (!f.errorCode || i.errorCode === f.errorCode));
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
