/**
 * Pure form model of the action create / edit forms: defaults (SLA deadline), prefill from a Decision Brief
 * recommendation, client-side validation mirroring ActionCreateSchema / ActionUpdateSchema, minimal PATCH bodies
 * and the BR-ACT-01 guard (no "Done" without evidence, AC-014).
 */
import type { ActionCreateInput, ActionUpdateInput } from "@/lib/contract";
import { OWNER_BGH, OWNER_DISCIPLINE, addDays, gvcnOwner, isIsoDate, type DecisionBrief } from "@/lib/engine";
import type { ActionItem, ActionStatus, ClassInfo, LevelId, Period, Priority } from "@/lib/types";

/** Same text as the server (ACTION_MSG.evidenceRequired) so both checks read alike. */
export const EVIDENCE_REQUIRED_MESSAGE = "Cần nhập minh chứng hoàn tất trước khi chuyển sang Hoàn thành";

export const LIMITS = { title: 300, description: 2000, owner: 120, evidence: 2000, note: 500 } as const;

export interface ActionFormValues {
  title: string;
  description: string;
  priority: Priority;
  owner: string;
  deadline: string; // yyyy-mm-dd
  scopeClass?: string;
  sourceWeek?: string; // Monday yyyy-mm-dd
  evidence: string;
  /** Free note appended to the history on save (edit only). */
  note: string;
}

export type ActionFormErrors = Partial<Record<keyof ActionFormValues, string>>;

export type BriefRecommendation = DecisionBrief["recommendations"][number];

export function suggestedDeadline(today: string, priority: Priority, sla: Record<Priority, number>): string {
  return addDays(today, sla[priority]);
}

export function emptyActionForm(today: string, sla: Record<Priority, number>, priority: Priority = "Medium"): ActionFormValues {
  return { title: "", description: "", priority, owner: "", deadline: suggestedDeadline(today, priority, sla), evidence: "", note: "" };
}

/** Prefill from a brief recommendation: deadline = today + deadlineDays; source week = the brief's week (week mode only). */
export function formFromRecommendation(rec: BriefRecommendation, ctx: { today: string; period: Period; periodLabel: string }): ActionFormValues {
  return {
    title: rec.title.slice(0, LIMITS.title),
    description: `Đề xuất từ Bản tóm tắt quyết định – ${ctx.periodLabel}.`,
    priority: rec.priority,
    owner: rec.owner.slice(0, LIMITS.owner),
    deadline: addDays(ctx.today, rec.deadlineDays),
    scopeClass: rec.scopeClass,
    sourceWeek: ctx.period.mode === "week" && ctx.period.key ? ctx.period.key : undefined,
    evidence: "",
    note: "",
  };
}

export function formFromAction(item: ActionItem): ActionFormValues {
  return {
    title: item.title,
    description: item.description ?? "",
    priority: item.priority,
    owner: item.owner,
    deadline: item.deadline,
    scopeClass: item.scopeClass,
    sourceWeek: item.sourceWeek,
    evidence: item.evidence ?? "",
    note: "",
  };
}

/**
 * Client-side validation (the server validates again). `today` set → create mode: the deadline may not be in the past.
 */
export function validateActionForm(v: ActionFormValues, opts: { today?: string } = {}): ActionFormErrors {
  const e: ActionFormErrors = {};
  const title = v.title.trim();
  if (title.length < 3) e.title = "Nhập nội dung hành động (ít nhất 3 ký tự)";
  else if (title.length > LIMITS.title) e.title = `Tối đa ${LIMITS.title} ký tự`;
  const owner = v.owner.trim();
  if (owner.length < 2) e.owner = "Nhập người chịu trách nhiệm";
  else if (owner.length > LIMITS.owner) e.owner = `Tối đa ${LIMITS.owner} ký tự`;
  if (!isIsoDate(v.deadline)) e.deadline = "Chọn hạn xử lý";
  else if (opts.today && v.deadline < opts.today) e.deadline = "Hạn xử lý không được trước hôm nay";
  if (v.description.trim().length > LIMITS.description) e.description = `Tối đa ${LIMITS.description} ký tự`;
  if (v.evidence.trim().length > LIMITS.evidence) e.evidence = `Tối đa ${LIMITS.evidence} ký tự`;
  if (v.note.trim().length > LIMITS.note) e.note = `Tối đa ${LIMITS.note} ký tự`;
  return e;
}

export function hasErrors(e: ActionFormErrors): boolean {
  return Object.values(e).some(Boolean);
}

/** POST body (optional fields omitted when empty). */
export function toCreateInput(levelId: LevelId, v: ActionFormValues): ActionCreateInput {
  const input: ActionCreateInput = {
    levelId,
    title: v.title.trim(),
    priority: v.priority,
    owner: v.owner.trim(),
    deadline: v.deadline,
  };
  const description = v.description.trim();
  if (description) input.description = description;
  if (v.scopeClass) input.scopeClass = v.scopeClass;
  if (v.sourceWeek) input.sourceWeek = v.sourceWeek;
  return input;
}

/**
 * Minimal PATCH body: only fields that changed ("" clears description/evidence), plus the history note.
 * Scope class / source week are fixed after creation (ActionUpdateSchema has no such fields).
 */
export function toUpdatePatch(item: ActionItem, v: ActionFormValues): ActionUpdateInput {
  const patch: ActionUpdateInput = {};
  const title = v.title.trim();
  if (title !== item.title) patch.title = title;
  const description = v.description.trim();
  if (description !== (item.description ?? "")) patch.description = description;
  if (v.priority !== item.priority) patch.priority = v.priority;
  const owner = v.owner.trim();
  if (owner !== item.owner) patch.owner = owner;
  if (v.deadline !== item.deadline) patch.deadline = v.deadline;
  const evidence = v.evidence.trim();
  if (evidence !== (item.evidence ?? "")) patch.evidence = evidence;
  const note = v.note.trim();
  if (note) patch.note = note;
  return patch;
}

export function isPatchEmpty(p: ActionUpdateInput): boolean {
  return Object.keys(p).length === 0;
}

/**
 * Status change together with the pending edits. Moving to "Done" without evidence is blocked here (BR-ACT-01 / AC-014)
 * – the server rejects it too (400).
 */
export function statusChangePatch(item: ActionItem, v: ActionFormValues, to: ActionStatus): { patch: ActionUpdateInput } | { error: string } {
  if (to === "Done" && !v.evidence.trim()) return { error: EVIDENCE_REQUIRED_MESSAGE };
  return { patch: { ...toUpdatePatch(item, v), status: to } };
}

export interface StatusStep {
  to: ActionStatus;
  label: string;
  variant: "primary" | "secondary" | "gold";
}

/** Workflow buttons available from a status. */
export function statusSteps(status: ActionStatus): StatusStep[] {
  if (status === "Open") {
    return [
      { to: "Doing", label: "Bắt đầu thực hiện", variant: "primary" },
      { to: "Done", label: "Hoàn thành", variant: "secondary" },
    ];
  }
  if (status === "Doing") return [{ to: "Done", label: "Hoàn thành", variant: "gold" }];
  return [{ to: "Doing", label: "Mở lại", variant: "secondary" }];
}

/** Quick owner choices: discipline office, BGH and – with a class – its homeroom teacher. */
export function ownerSuggestions(scopeClass: string | undefined, classes: readonly ClassInfo[]): Array<{ value: string; hint?: string }> {
  const out: Array<{ value: string; hint?: string }> = [{ value: OWNER_DISCIPLINE }, { value: OWNER_BGH }];
  if (scopeClass) {
    const teacher = classes.find((c) => c.code === scopeClass)?.homeroomTeacher;
    out.unshift({ value: gvcnOwner(scopeClass), hint: teacher });
  }
  return out;
}
