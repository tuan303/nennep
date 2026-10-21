/**
 * Form models + client-side validation of the student dialogs (pure – unit-tested).
 * The server re-validates everything; these checks give instant, field-level Vietnamese feedback.
 */
import type {
  StudentCreateInput,
  StudentPromoteInput,
  StudentReinstateInput,
  StudentTransferInput,
  StudentUpdateInput,
  StudentWithdrawInput,
} from "@/lib/contract";
import { LEVEL_IDS, LEVELS, STUDENT_STATUS_LABELS } from "@/lib/constants";
import { isIsoDate } from "@/lib/engine/dates";
import type { LevelId, Student, StudentLite } from "@/lib/types";
import { genderChoiceOf, genderValue, type GenderChoice, type LeaveStatus } from "./labels";

export type FormErrors<K extends string> = Partial<Record<K, string>>;

export interface FormResult<K extends string, T> {
  errors: FormErrors<K>;
  /** Present when the form is valid. */
  value?: T;
}

const NOTE_MAX = 500;

function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function noteError(note: string): string | undefined {
  return note.trim().length > NOTE_MAX ? `Ghi chú tối đa ${NOTE_MAX} ký tự.` : undefined;
}

function dateError(date: string, label: string, required: boolean): string | undefined {
  if (!date) return required ? `Chọn ${label.toLocaleLowerCase("vi")}.` : undefined;
  return isIsoDate(date) ? undefined : `${label} không hợp lệ.`;
}

function nameError(name: string): string | undefined {
  const n = clean(name);
  if (n.length < 2) return "Nhập họ và tên (ít nhất 2 ký tự).";
  if (n.length > 120) return "Họ và tên tối đa 120 ký tự.";
  return undefined;
}

function dobError(dob: string, today: string): string | undefined {
  const e = dateError(dob, "Ngày sinh", false);
  if (e) return e;
  return dob && dob > today ? "Ngày sinh không được sau hôm nay." : undefined;
}

function pick<K extends string>(errors: Record<K, string | undefined>): FormErrors<K> {
  const out: FormErrors<K> = {};
  for (const k of Object.keys(errors) as K[]) if (errors[k]) out[k] = errors[k];
  return out;
}

function isEmpty(errors: object): boolean {
  return Object.keys(errors).length === 0;
}

/* ------------------------------- Add student ------------------------------- */

export interface AddForm {
  enrollType: "NEW" | "TRANSFER_IN";
  id: string;
  name: string;
  dob: string;
  gender: GenderChoice;
  classCode: string;
  enrollDate: string;
  note: string;
}

export type AddField = Exclude<keyof AddForm, "enrollType">;

export function emptyAddForm(today: string, keep?: Pick<AddForm, "enrollType" | "classCode" | "enrollDate">): AddForm {
  return {
    enrollType: keep?.enrollType ?? "NEW",
    id: "",
    name: "",
    dob: "",
    gender: "none",
    classCode: keep?.classCode ?? "",
    enrollDate: keep?.enrollDate ?? today,
    note: "",
  };
}

/** Existing student of the level with this Mã HS (exact after trimming). */
export function findDuplicateStudent(students: readonly StudentLite[], id: string): StudentLite | undefined {
  const t = id.trim();
  return t ? students.find((s) => s.id === t) : undefined;
}

export function duplicateMessage(s: StudentLite): string {
  if (s.status === "ACTIVE") return `Mã HS đã có: ${s.name} (lớp ${s.classCode}).`;
  return `Mã HS đã có: ${s.name} (lớp ${s.classCode} – ${STUDENT_STATUS_LABELS[s.status]}). Dùng “Khôi phục” nếu học sinh quay lại trường.`;
}

export function validateAddForm(
  form: AddForm,
  ctx: { levelId: LevelId; students: readonly StudentLite[]; today: string },
): FormResult<AddField, StudentCreateInput> {
  const id = form.id.trim();
  const dupe = findDuplicateStudent(ctx.students, id);
  const errors = pick<AddField>({
    id: !id
      ? "Nhập mã học sinh."
      : /\s/.test(id)
        ? "Mã HS không được chứa khoảng trắng."
        : id.length > 32
          ? "Mã HS tối đa 32 ký tự."
          : dupe
            ? duplicateMessage(dupe)
            : undefined,
    name: nameError(form.name),
    dob: dobError(form.dob, ctx.today),
    gender: undefined,
    classCode: form.classCode ? undefined : "Chọn lớp.",
    enrollDate: dateError(form.enrollDate, form.enrollType === "NEW" ? "Ngày nhập học" : "Ngày chuyển đến", true),
    note: noteError(form.note),
  });
  if (!isEmpty(errors)) return { errors };
  const gender = genderValue(form.gender);
  const note = form.note.trim();
  return {
    errors,
    value: {
      levelId: ctx.levelId,
      id,
      name: clean(form.name),
      classCode: form.classCode,
      enrollDate: form.enrollDate,
      enrollType: form.enrollType,
      ...(form.dob ? { dob: form.dob } : {}),
      ...(gender ? { gender } : {}),
      ...(note ? { note } : {}),
    },
  };
}

/* ------------------------------- Edit student ------------------------------ */

export interface EditForm {
  name: string;
  dob: string;
  gender: GenderChoice;
  note: string;
}

export type EditField = keyof EditForm;

export function editFormOf(s: Pick<Student, "name" | "dob" | "gender" | "note">): EditForm {
  return { name: s.name, dob: s.dob ?? "", gender: genderChoiceOf(s.gender), note: s.note ?? "" };
}

/**
 * Patch with the changed fields only. `changed: false` when nothing differs (the save button stays disabled).
 * A stored date of birth cannot be cleared through the API (it only accepts a valid date), so emptying it is an error.
 */
export function buildUpdatePatch(
  form: EditForm,
  before: Pick<Student, "name" | "dob" | "gender" | "note">,
  today: string,
): FormResult<EditField, StudentUpdateInput> & { changed: boolean } {
  const errors = pick<EditField>({
    name: nameError(form.name),
    dob: before.dob && !form.dob ? "Không xóa được ngày sinh đã lưu – hãy nhập ngày đúng." : dobError(form.dob, today),
    gender: undefined,
    note: noteError(form.note),
  });
  const patch: StudentUpdateInput = {};
  const name = clean(form.name);
  if (name !== before.name) patch.name = name;
  if (form.dob && form.dob !== (before.dob ?? "")) patch.dob = form.dob;
  if (form.gender !== genderChoiceOf(before.gender)) patch.gender = genderValue(form.gender);
  const note = form.note.trim();
  if (note !== (before.note ?? "").trim()) patch.note = note;
  const changed = Object.keys(patch).length > 0;
  if (!isEmpty(errors)) return { errors, changed };
  return { errors, changed, value: changed ? patch : undefined };
}

/* ------------------------------ Transfer class ----------------------------- */

export interface TransferForm {
  toClassCode: string;
  effectiveDate: string;
  note: string;
}

export type TransferField = keyof TransferForm;

export function validateTransfer(form: TransferForm, currentClass: string): FormResult<TransferField, StudentTransferInput> {
  const errors = pick<TransferField>({
    toClassCode: !form.toClassCode ? "Chọn lớp mới." : form.toClassCode === currentClass ? `Học sinh đang ở lớp ${currentClass}.` : undefined,
    effectiveDate: dateError(form.effectiveDate, "Ngày hiệu lực", true),
    note: noteError(form.note),
  });
  if (!isEmpty(errors)) return { errors };
  const note = form.note.trim();
  return { errors, value: { toClassCode: form.toClassCode, effectiveDate: form.effectiveDate, ...(note ? { note } : {}) } };
}

/* -------------------------------- Withdraw -------------------------------- */

export interface WithdrawForm {
  status: LeaveStatus;
  date: string;
  reason: string;
  note: string;
}

export type WithdrawField = keyof WithdrawForm;

export function validateWithdraw(form: WithdrawForm): FormResult<WithdrawField, StudentWithdrawInput> {
  const reason = clean(form.reason);
  const errors = pick<WithdrawField>({
    status: undefined,
    date: dateError(form.date, "Ngày", true),
    reason: reason.length < 2 ? "Nhập lý do / nơi chuyển đến." : reason.length > 300 ? "Tối đa 300 ký tự." : undefined,
    note: noteError(form.note),
  });
  if (!isEmpty(errors)) return { errors };
  const note = form.note.trim();
  return { errors, value: { status: form.status, date: form.date, reason, ...(note ? { note } : {}) } };
}

/* -------------------------------- Reinstate -------------------------------- */

export interface ReinstateForm {
  classCode: string;
  date: string;
  note: string;
}

export type ReinstateField = keyof ReinstateForm;

export function validateReinstate(form: ReinstateForm): FormResult<ReinstateField, StudentReinstateInput> {
  const errors = pick<ReinstateField>({
    classCode: form.classCode ? undefined : "Chọn lớp.",
    date: dateError(form.date, "Ngày", true),
    note: noteError(form.note),
  });
  if (!isEmpty(errors)) return { errors };
  const note = form.note.trim();
  return { errors, value: { classCode: form.classCode, date: form.date, ...(note ? { note } : {}) } };
}

/* ------------------------- Promote level (chuyển cấp) ------------------------- */

export interface PromoteForm {
  toLevelId: LevelId | "";
  classCode: string;
  date: string;
  note: string;
}

export type PromoteField = keyof PromoteForm;

/** Default target of a level change: the next level (TH → THCS → THPT) when accessible, else the first other one. */
export function defaultPromoteLevel(from: LevelId, accessible: readonly LevelId[]): LevelId | undefined {
  const next = LEVEL_IDS[LEVEL_IDS.indexOf(from) + 1];
  if (next && accessible.includes(next)) return next;
  return accessible.find((l) => l !== from);
}

export function validatePromote(form: PromoteForm, fromLevel: LevelId): FormResult<PromoteField, StudentPromoteInput> {
  const errors = pick<PromoteField>({
    toLevelId: !form.toLevelId ? "Chọn cấp học mới." : form.toLevelId === fromLevel ? `Học sinh đang thuộc cấp ${LEVELS[fromLevel].short}.` : undefined,
    classCode: form.classCode ? undefined : "Chọn lớp ở cấp mới.",
    date: dateError(form.date, "Ngày", true),
    note: noteError(form.note),
  });
  if (!isEmpty(errors) || !form.toLevelId) return { errors };
  const note = form.note.trim();
  return { errors, value: { toLevelId: form.toLevelId, classCode: form.classCode, date: form.date, ...(note ? { note } : {}) } };
}

/** Keep only server field errors that belong to the form (e.g. VALIDATION details keyed by field). */
export function knownFieldErrors<K extends string>(server: Record<string, string>, fields: readonly K[]): FormErrors<K> {
  const out: FormErrors<K> = {};
  for (const f of fields) if (server[f]) out[f] = server[f];
  return out;
}
