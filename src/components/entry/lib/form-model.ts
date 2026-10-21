/**
 * Form state of the "Nhập liệu" screen and its transitions (pure – unit-tested).
 * Business rules (points, validation) live in the engine; this module only shapes UI state.
 */
import { isIsoDate, weekdayLabelVN } from "@/lib/engine/dates";
import type { Incident, IncidentStatus, Scope, Unit } from "@/lib/types";
import { createDraftMemory, draftPrefix, sameList, typedLinks } from "./leave-guard";

export const DEFAULT_INCIDENT_STATUS: IncidentStatus = "Mới ghi nhận";

export interface EntryForm {
  /** yyyy-mm-dd ("" while the native picker is cleared). */
  date: string;
  /** "" = no class chosen yet. */
  classCode: string;
  /** "" = no error chosen yet. */
  errorCode: string;
  scope: Scope;
  /** The user picked the scope explicitly – choosing another error no longer changes it. */
  scopeTouched: boolean;
  studentIds: string[];
  /** "/HS" + "Tập thể" only (normalised away otherwise). */
  unnamedCount: number;
  /** "/lần" only (normalised to 1 for "/HS"). */
  occurrenceCount: number;
  detail: string;
  reporter: string;
  status: IncidentStatus;
  photoIds: string[];
  /** Evidence link inputs as typed (may contain empty / invalid drafts). */
  links: string[];
}

export const DATE_HINT = {
  empty: "Chọn ngày ghi nhận.",
  invalid: "Ngày không hợp lệ.",
  future: "Không chọn được ngày trong tương lai.",
} as const;

/**
 * Text under the "Ngày" field: a prompt when the native picker was cleared, an error for a malformed or future date
 * (iOS ignores `max`), otherwise the weekday ("Thứ Tư · hôm nay").
 */
export function entryDateHint(date: string, today: string, calendarProblem?: string): { hint?: string; error?: string } {
  if (!date) return { hint: DATE_HINT.empty };
  if (!isIsoDate(date)) return { error: DATE_HINT.invalid };
  if (date > today) return { error: DATE_HINT.future };
  // Outside the school-week calendar (see entryCalendarProblem) – the server would refuse it.
  if (calendarProblem) return { error: calendarProblem };
  return { hint: `${weekdayLabelVN(date)}${date === today ? " · hôm nay" : ""}` };
}

/** Default scope of an error: "/HS" errors are usually about named students, "/lần" errors about the class. */
export function defaultScopeForUnit(unit: Unit): Scope {
  return unit === "/lần" ? "Tập thể" : "Cá nhân";
}

export function newEntryForm(args: { today: string; reporter?: string; classCode?: string; scope?: Scope }): EntryForm {
  return {
    date: args.today,
    classCode: args.classCode ?? "",
    errorCode: "",
    scope: args.scope ?? "Cá nhân",
    scopeTouched: false,
    studentIds: [],
    unnamedCount: 0,
    occurrenceCount: 1,
    detail: "",
    reporter: args.reporter ?? "",
    status: DEFAULT_INCIDENT_STATUS,
    photoIds: [],
    links: [],
  };
}

/** New error: the scope follows the error's unit unless the user already chose it. */
export function withErrorCode(form: EntryForm, errorCode: string, unit: Unit | undefined): EntryForm {
  const scope = !form.scopeTouched && unit ? defaultScopeForUnit(unit) : form.scope;
  return { ...form, errorCode, scope };
}

export function withScope(form: EntryForm, scope: Scope): EntryForm {
  return { ...form, scope, scopeTouched: true };
}

/** Students belong to a class (FR-ENT-002): changing the class clears the selection. */
export function withClass(form: EntryForm, classCode: string): EntryForm {
  if (classCode === form.classCode) return form;
  return { ...form, classCode, studentIds: [], unnamedCount: 0 };
}

/**
 * "Lưu & nhập tiếp": keep date, class and scope (and who records), clear everything about the incident itself.
 */
export function nextEntryForm(form: EntryForm): EntryForm {
  return {
    ...newEntryForm({ today: form.date, reporter: form.reporter, classCode: form.classCode, scope: form.scope }),
    scopeTouched: form.scopeTouched,
  };
}

/** "Lưu": a blank form for today; the last used class stays preselected and the recorder's name is kept. */
export function freshEntryForm(form: EntryForm, today: string): EntryForm {
  return newEntryForm({ today, reporter: form.reporter, classCode: form.classCode });
}

/** Prefill for edit mode (?edit=<id>). */
export function formFromIncident(i: Incident): EntryForm {
  return {
    date: i.date,
    classCode: i.classCode,
    errorCode: i.errorCode,
    scope: i.scope,
    scopeTouched: true,
    studentIds: i.students.map((s) => s.id),
    unnamedCount: i.unnamedCount,
    occurrenceCount: Math.max(1, i.occurrenceCount || 1),
    detail: i.detail ?? "",
    reporter: i.reporter ?? "",
    status: i.status,
    photoIds: [...i.photoIds],
    links: [...i.evidenceUrls],
  };
}

/** Most recently used classes first, without duplicates (React-state memory of the screen). */
export function rememberClass(recent: readonly string[], classCode: string, limit = 4): string[] {
  if (!classCode) return [...recent];
  return [classCode, ...recent.filter((c) => c !== classCode)].slice(0, limit);
}

/**
 * The form holds input that would be lost by leaving: anything differs from the state it started from (blank form,
 * the form after the last save, or the record being edited). Whitespace-only text and empty link boxes do not count.
 */
export function entryFormDirty(form: EntryForm, baseline: EntryForm): boolean {
  return (
    form.date !== baseline.date ||
    form.classCode !== baseline.classCode ||
    form.errorCode !== baseline.errorCode ||
    form.scope !== baseline.scope ||
    !sameList(form.studentIds, baseline.studentIds) ||
    form.unnamedCount !== baseline.unnamedCount ||
    form.occurrenceCount !== baseline.occurrenceCount ||
    form.detail.trim() !== baseline.detail.trim() ||
    form.reporter.trim() !== baseline.reporter.trim() ||
    form.status !== baseline.status ||
    !sameList(form.photoIds, baseline.photoIds) ||
    !sameList(typedLinks(form.links), typedLinks(baseline.links))
  );
}

/** Unfinished incident forms of this tab (see `createDraftMemory`). */
export const entryDrafts = createDraftMemory<EntryForm>();

/**
 * Draft key: user + level + "new" or the edited record at its current version (a record changed elsewhere since
 * never gets an outdated draft back). undefined while signed out.
 */
export function entryDraftKey(uid: string | undefined, levelId: string, editing?: Pick<Incident, "id" | "createdAt" | "updatedAt">): string | undefined {
  if (!uid) return undefined;
  return `${draftPrefix(uid, levelId)}${editing ? `edit:${editing.id}@${editing.updatedAt ?? editing.createdAt}` : "new"}`;
}
