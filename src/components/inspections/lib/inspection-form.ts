/**
 * "Đợt kiểm tra" (REQ_V2 §7.1 / §12): form state, class-selection helpers, client checks mirroring the server
 * (`validateInspectionRules`), API payloads, edit rights and the recent list. Pure – unit-tested.
 */
import { createDraftMemory, draftPrefix, sameList } from "@/components/entry/lib/leave-guard";
import { compareClasses, gradeLabel } from "@/components/app/widgets/lib/class-options";
import { editWindowRemainingMs, type AccessProfile } from "@/components/app/widgets/lib/incident-access";
import type { InspectionCreateInput, InspectionUpdateInput } from "@/lib/contract";
import { hasPermission } from "@/lib/constants";
import { addDays, formatDateVN, isIsoDate } from "@/lib/engine/dates";
import { calendarDateProblem } from "@/lib/engine/period";
import type { CatalogItem, ClassInfo, Inspection, InspectionShift, LevelDataset, LevelId } from "@/lib/types";

/** "" = không ghi buổi. */
export type ShiftChoice = InspectionShift | "";

export const GENERAL_INSPECTION_LABEL = "Kiểm tra chung";
export const INSPECTOR_MAX = 120;
export const INSPECTION_NOTE_MAX = 1000;
export const RECENT_INSPECTION_DAYS = 30;

export const INSPECTION_MSG = {
  noDate: "Chọn ngày kiểm tra.",
  invalidDate: "Ngày không hợp lệ.",
  futureDate: "Không thể ghi nhận đợt kiểm tra ở ngày trong tương lai.",
  noClasses: "Chọn ít nhất 1 lớp được kiểm tra.",
  inspectorLong: `Tên người kiểm tra tối đa ${INSPECTOR_MAX} ký tự.`,
  noteLong: `Ghi chú tối đa ${INSPECTION_NOTE_MAX} ký tự.`,
  unknownClass: (code: string) => `Lớp "${code}" không có trong danh mục.`,
  inactiveClass: (code: string) => `Lớp ${code} đã ngừng hoạt động.`,
  unknownCategory: (category: string) => `Mảng "${category}" không có trong danh mục lỗi.`,
} as const;

export interface InspectionForm {
  /** yyyy-mm-dd ("" while the picker is cleared). */
  date: string;
  shift: ShiftChoice;
  /** Mảng kiểm tra; "" = kiểm tra chung (mọi mảng). */
  category: string;
  /** Selected classes (any order; payloads use the class display order). */
  classCodes: string[];
  inspector: string;
  note: string;
}

/** Buổi from the time of day in Vietnam (UTC+7): before noon → "Sáng", else "Chiều". */
export function shiftForTime(ms: number): InspectionShift {
  const hourVN = (new Date(ms).getUTCHours() + 7) % 24;
  return hourVN < 12 ? "Sáng" : "Chiều";
}

export function newInspectionForm(args: { today: string; inspector?: string; shift?: ShiftChoice }): InspectionForm {
  return { date: args.today, shift: args.shift ?? "", category: "", classCodes: [], inspector: args.inspector ?? "", note: "" };
}

/** "Lưu đợt kiểm tra" done: same day, buổi and inspector; classes, Mảng and note cleared. */
export function nextInspectionForm(form: InspectionForm): InspectionForm {
  return newInspectionForm({ today: form.date, inspector: form.inspector, shift: form.shift });
}

export function inspectionFormFromRecord(r: Inspection): InspectionForm {
  return {
    date: r.date,
    shift: r.shift ?? "",
    category: r.category ?? "",
    classCodes: [...r.classCodes],
    inspector: r.inspector ?? "",
    note: r.note ?? "",
  };
}

const sortedCodes = (codes: readonly string[]) => [...new Set(codes)].sort();

export function inspectionFormDirty(form: InspectionForm, baseline: InspectionForm): boolean {
  return (
    form.date !== baseline.date ||
    form.shift !== baseline.shift ||
    form.category !== baseline.category ||
    !sameList(sortedCodes(form.classCodes), sortedCodes(baseline.classCodes)) ||
    form.inspector.trim() !== baseline.inspector.trim() ||
    form.note.trim() !== baseline.note.trim()
  );
}

/* --------------------------------- choices -------------------------------- */

/** Mảng of the catalog (first-appearance order) + `keep` (the stored Mảng of a record being edited). */
export function inspectionCategories(catalog: readonly Pick<CatalogItem, "category">[], keep?: string): string[] {
  const out: string[] = [];
  for (const c of catalog) {
    const name = c.category.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  if (keep && !out.includes(keep)) out.push(keep);
  return out;
}

export interface GradeGroup {
  grade: number;
  label: string;
  classes: ClassInfo[];
}

/** Active classes (+ `keep`: classes already on the record, even if deactivated since) grouped by grade, display order. */
export function selectableClassGroups(classes: readonly ClassInfo[], keep: readonly string[] = []): GradeGroup[] {
  const kept = new Set(keep);
  const list = classes.filter((c) => c.active || kept.has(c.code)).sort(compareClasses);
  const groups: GradeGroup[] = [];
  for (const c of list) {
    const last = groups[groups.length - 1];
    if (last && last.grade === c.grade) last.classes.push(c);
    else groups.push({ grade: c.grade, label: gradeLabel(c.grade), classes: [c] });
  }
  return groups;
}

export function toggleClass(selected: readonly string[], code: string): string[] {
  return selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
}

export type GroupState = "all" | "some" | "none";

export function gradeSelectionState(selected: readonly string[], group: Pick<GradeGroup, "classes">): GroupState {
  const set = new Set(selected);
  const n = group.classes.filter((c) => set.has(c.code)).length;
  if (n === 0) return "none";
  return n === group.classes.length ? "all" : "some";
}

/** "Chọn cả khối" on/off (other grades unchanged). */
export function setGradeSelected(selected: readonly string[], group: Pick<GradeGroup, "classes">, on: boolean): string[] {
  const codes = group.classes.map((c) => c.code);
  if (!on) return selected.filter((c) => !codes.includes(c));
  return [...selected, ...codes.filter((c) => !selected.includes(c))];
}

/** "Chọn tất cả" / "Bỏ chọn" over every listed class. */
export function setAllSelected(groups: readonly Pick<GradeGroup, "classes">[], on: boolean): string[] {
  return on ? groups.flatMap((g) => g.classes.map((c) => c.code)) : [];
}

/** Codes in class display order (unknown codes last, natural order). */
export function orderClassCodes(codes: readonly string[], classes: readonly ClassInfo[]): string[] {
  const position = new Map([...classes].sort(compareClasses).map((c, i) => [c.code, i]));
  return [...new Set(codes)].sort(
    (a, b) => (position.get(a) ?? Number.MAX_SAFE_INTEGER) - (position.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b, "vi", { numeric: true }),
  );
}

/* -------------------------------- validation ------------------------------- */

type InspectionDataset = Pick<LevelDataset, "classes" | "catalog" | "weeks">;

/**
 * The server's checks, so the save button can say why it is disabled: date set, valid, not in the future and inside
 * the school-week calendar (an edit keeping its date skips the calendar), ≥ 1 class, every class known and active
 * (classes already on the record may have been deactivated since), Mảng of the catalog (the stored one stays valid).
 */
export function validateInspectionForm(form: InspectionForm, ds: InspectionDataset, today: string, original?: Pick<Inspection, "date" | "classCodes" | "category">): string[] {
  const errors: string[] = [];
  if (!form.date) errors.push(INSPECTION_MSG.noDate);
  else if (!isIsoDate(form.date)) errors.push(INSPECTION_MSG.invalidDate);
  else if (form.date > today) errors.push(INSPECTION_MSG.futureDate);
  else if (!original || original.date !== form.date) {
    const outside = calendarDateProblem(form.date, ds.weeks);
    if (outside) errors.push(outside);
  }

  const codes = [...new Set(form.classCodes)];
  if (codes.length === 0) errors.push(INSPECTION_MSG.noClasses);
  const kept = new Set(original?.classCodes ?? []);
  for (const code of codes) {
    const cls = ds.classes.find((c) => c.code === code);
    if (!cls) errors.push(INSPECTION_MSG.unknownClass(code));
    else if (!cls.active && !kept.has(code)) errors.push(INSPECTION_MSG.inactiveClass(cls.code));
  }

  const category = form.category.trim();
  if (category && category !== original?.category && !ds.catalog.some((c) => c.category === category)) errors.push(INSPECTION_MSG.unknownCategory(category));
  if (form.inspector.trim().length > INSPECTOR_MAX) errors.push(INSPECTION_MSG.inspectorLong);
  if (form.note.trim().length > INSPECTION_NOTE_MAX) errors.push(INSPECTION_MSG.noteLong);
  return errors;
}

/* --------------------------------- payloads -------------------------------- */

/** POST /api/inspections body without the idempotency key; empty buổi / Mảng / inspector / note are omitted. */
export function toInspectionCreateInput(levelId: LevelId, form: InspectionForm, classes: readonly ClassInfo[]): Omit<InspectionCreateInput, "clientRequestId"> {
  const input: Omit<InspectionCreateInput, "clientRequestId"> = { levelId, date: form.date, classCodes: orderClassCodes(form.classCodes, classes) };
  if (form.shift) input.shift = form.shift;
  const category = form.category.trim();
  const inspector = form.inspector.trim();
  const note = form.note.trim();
  if (category) input.category = category;
  if (inspector) input.inspector = inspector;
  if (note) input.note = note;
  return input;
}

/**
 * PATCH /api/inspections/:id body: only the changed fields ("" clears buổi / Mảng / note; an empty inspector falls back
 * to the creator on the server) + `baseRev` = the revision the form was opened from (409 when changed meanwhile).
 */
export function toInspectionUpdateInput(form: InspectionForm, original: Inspection, classes: readonly ClassInfo[]): InspectionUpdateInput {
  const patch: InspectionUpdateInput = { baseRev: original.rev ?? 0 };
  if (form.date !== original.date) patch.date = form.date;
  if (form.shift !== (original.shift ?? "")) patch.shift = form.shift;
  if (form.category.trim() !== (original.category ?? "")) patch.category = form.category.trim();
  if (!sameList(sortedCodes(form.classCodes), sortedCodes(original.classCodes))) patch.classCodes = orderClassCodes(form.classCodes, classes);
  if (form.inspector.trim() !== (original.inspector ?? "").trim()) patch.inspector = form.inspector.trim();
  if (form.note.trim() !== (original.note ?? "").trim()) patch.note = form.note.trim();
  return patch;
}

/** Nothing but `baseRev`: no change to send. */
export function isInspectionPatchEmpty(patch: InspectionUpdateInput): boolean {
  return Object.keys(patch).every((k) => k === "baseRev");
}

/* ------------------------------ rights & list ------------------------------ */

/** ADMIN: any round; EDITOR: own rounds within 24 h (server `assertCanEditRecord`); never deleted ones. */
export function canEditInspection(profile: AccessProfile | null | undefined, r: Pick<Inspection, "createdBy" | "createdAt" | "deletedAt">, nowMs: number): boolean {
  if (!profile || !profile.active || r.deletedAt || !hasPermission(profile, "inspection.manage")) return false;
  if (hasPermission(profile, "record.editAny")) return true;
  return hasPermission(profile, "record.editOwnRecent") && r.createdBy === profile.uid && editWindowRemainingMs(r, nowMs) > 0;
}

/** Non-deleted rounds dated in the last `days` days (today included), newest first (date, then code). */
export function recentInspections(list: readonly Inspection[] | undefined, today: string, days = RECENT_INSPECTION_DAYS): Inspection[] {
  const from = addDays(today, -(days - 1));
  return (list ?? [])
    .filter((r) => !r.deletedAt && r.date >= from && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
}

/** "Chuyên cần – vệ sinh" or "Kiểm tra chung". */
export function inspectionScopeLabel(r: Pick<Inspection, "category">): string {
  return r.category?.trim() || GENERAL_INSPECTION_LABEL;
}

/** "21/10/2026 · Sáng · 6 lớp · Chuyên cần – vệ sinh" */
export function inspectionSummary(r: Pick<Inspection, "date" | "shift" | "classCodes" | "category">): string {
  return [formatDateVN(r.date), r.shift ?? "", `${r.classCodes.length} lớp`, inspectionScopeLabel(r)].filter(Boolean).join(" · ");
}

/** Rounds recorded on `today` (by date) and the number of distinct classes they cover. */
export function inspectionDayStats(list: readonly Inspection[] | undefined, today: string): { rounds: number; classes: number } {
  const rounds = (list ?? []).filter((r) => !r.deletedAt && r.date === today);
  return { rounds: rounds.length, classes: new Set(rounds.flatMap((r) => r.classCodes)).size };
}

/* --------------------------------- drafts ---------------------------------- */

/** Unfinished "Ghi nhận đợt kiểm tra" forms of this tab (in memory only). */
export const inspectionDrafts = createDraftMemory<InspectionForm>();

export function inspectionDraftKey(uid: string | undefined, levelId: string): string | undefined {
  return uid ? `${draftPrefix(uid, levelId)}inspection:new` : undefined;
}
