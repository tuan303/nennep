/**
 * Tab "Cảnh báo sớm" of Hành động (REQ_V2 §7.6): grouping / filtering of the engine's `earlyWarnings` and the prefill of
 * "Tạo hành động" from a warning. Pure – unit-tested.
 */
import {
  EARLY_WARNING_KIND_LABELS,
  OWNER_DISCIPLINE,
  addDays,
  gvcnOwner,
  type EarlyWarning,
  type EarlyWarningKind,
  type WarningSeverity,
} from "@/lib/engine";
import type { CatalogItem, GlobalFilters, Incident, Priority, StudentLite } from "@/lib/types";
import { LIMITS, type ActionFormValues } from "./action-form";

export const WARNING_SEVERITIES: readonly WarningSeverity[] = ["high", "medium", "low"];
export const WARNING_KINDS: readonly EarlyWarningKind[] = ["SERIOUS_INCIDENT", "REPEAT_STUDENT", "RISING_CLASS", "PROLONGED_ERROR"];

export const WARNING_SEVERITY_LABELS: Record<WarningSeverity, string> = {
  high: "Mức cao – cần xử lý ngay",
  medium: "Mức trung bình – cần theo dõi",
  low: "Mức thấp",
};

/** One-line explanation of each kind (chip tooltips / empty states). */
export const WARNING_KIND_HINTS: Record<EarlyWarningKind, string> = {
  SERIOUS_INCIDENT: "Sự việc thuộc nhóm lỗi nghiêm trọng hoặc có mức trừ cao, chưa đóng.",
  REPEAT_STUDENT: "Học sinh có cảnh báo đỏ trong tuần hoặc tái phạm (Cấu hình thi đua → Cảnh báo học sinh).",
  RISING_CLASS: "Lớp có điểm trừ tuần tăng mạnh so với trung bình các tuần trước.",
  PROLONGED_ERROR: "Lớp mắc cùng một lỗi nhiều tuần liên tiếp.",
};

const PRIORITY_OF: Record<WarningSeverity, Priority> = { high: "High", medium: "Medium", low: "Low" };

export function priorityOfSeverity(severity: WarningSeverity): Priority {
  return PRIORITY_OF[severity];
}

export interface WarningGroup {
  severity: WarningSeverity;
  label: string;
  items: EarlyWarning[];
}

/** Non-empty groups high → medium → low, items in engine order. */
export function groupWarningsBySeverity(items: readonly EarlyWarning[]): WarningGroup[] {
  return WARNING_SEVERITIES.map((severity) => ({ severity, label: WARNING_SEVERITY_LABELS[severity], items: items.filter((w) => w.severity === severity) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Kind chip filter (undefined = every kind). */
export function filterWarningsByKind(items: readonly EarlyWarning[], kind?: EarlyWarningKind): EarlyWarning[] {
  return kind ? items.filter((w) => w.kind === kind) : [...items];
}

/** A GVCN's screens show their own classes only (`ownClasses` undefined = every class). */
export function warningsOfClasses(items: readonly EarlyWarning[], ownClasses?: readonly string[]): EarlyWarning[] {
  if (!ownClasses) return [...items];
  const set = new Set(ownClasses);
  return items.filter((w) => set.has(w.classCode));
}

/**
 * "Tạo hành động" prefill: title = the warning's message, priority from the severity, owner = GVCN of the class
 * (serious incidents → Cán bộ nền nếp), deadline = today + SLA of the priority, scope class, source week = reference week.
 */
export function formFromWarning(w: EarlyWarning, ctx: { today: string; sla: Record<Priority, number>; periodLabel?: string }): ActionFormValues {
  const priority = priorityOfSeverity(w.severity);
  const source = `Từ cảnh báo sớm “${EARLY_WARNING_KIND_LABELS[w.kind]}”${ctx.periodLabel ? ` – ${ctx.periodLabel}` : ""}.`;
  return {
    title: w.message.slice(0, LIMITS.title),
    description: source.slice(0, LIMITS.description),
    priority,
    owner: (w.kind === "SERIOUS_INCIDENT" ? OWNER_DISCIPLINE : gvcnOwner(w.classCode)).slice(0, LIMITS.owner),
    deadline: addDays(ctx.today, ctx.sla[priority]),
    scopeClass: w.classCode,
    sourceWeek: w.week,
    evidence: "",
    note: "",
  };
}

/** Evidence records of a warning that are in the dataset (newest first, as the engine lists them). */
export function warningIncidents(w: Pick<EarlyWarning, "evidence">, incidents: readonly Incident[]): Incident[] {
  const byId = new Map(incidents.map((i) => [i.id, i] as const));
  return w.evidence.incidentIds.map((id) => byId.get(id)).filter((i): i is Incident => !!i);
}

/**
 * Labels of the non-period filters narrowing the warnings (the Hành động page has no filter bar, so they are listed with
 * a "Bỏ lọc" button), e.g. ["Khối 6", "Lớp 6A01", "Nhóm lỗi: Nhóm 3"]; [] when none.
 */
export function warningScopeLabels(
  f: Pick<GlobalFilters, "grade" | "classCode" | "category" | "errorCode" | "group" | "studentId">,
  ds: { catalog: readonly Pick<CatalogItem, "code" | "issue">[]; students: readonly Pick<StudentLite, "id" | "name">[] },
): string[] {
  const out: string[] = [];
  if (f.grade !== undefined) out.push(`Khối ${f.grade}`);
  if (f.classCode) out.push(`Lớp ${f.classCode}`);
  if (f.category) out.push(`Mảng: ${f.category}`);
  if (f.errorCode) {
    const issue = ds.catalog.find((c) => c.code === f.errorCode)?.issue;
    out.push(issue ? `Lỗi ${f.errorCode} – ${issue}` : `Lỗi ${f.errorCode}`);
  }
  if (f.group) out.push(`Nhóm lỗi: ${f.group}`);
  if (f.studentId) {
    const name = ds.students.find((s) => s.id === f.studentId)?.name;
    out.push(name ? `Học sinh: ${name}` : `Học sinh: ${f.studentId}`);
  }
  return out;
}
