/**
 * Workbook import – "DS Học sinh" (IO-03): upsert students of the level. The class must exist (file or DB) and
 * Mã HS must be unique in the file. Existing students keep their status (withdrawals are never undone by a workbook
 * import); a source status other than "Đang học" is kept in `note`.
 * - A Mã HS of ANOTHER level: still studying there → ERROR; already left it (graduated / transferred / inactive) →
 *   WARNING and the student moves to this level (chuyển cấp, same Mã HS, history TRANSFER_IN with `fromLevel`).
 * - A student changed in the app since their last workbook import (transfer, reinstatement, edit, roster import…)
 *   is not reverted to the file's class / name / dob (WARNING, skipped) unless `options.overwriteAppChanges`.
 */
import { LEVELS, STUDENT_STATUS_LABELS } from "../../constants";
import type { WorkbookPayload } from "../../contract";
import { isIsoDate } from "../../engine/dates";
import { normalizeVN } from "../../engine/text";
import type { Student, StudentEvent, StudentLite } from "../../types";
import { toStudentLite } from "../digests";
import { omitEmpty } from "../records";
import { classProblem, cleanText, makeClassLookup, STATUS_TEXT_ACTIVE } from "./common";
import { canonicalJson } from "./hash";
import type { ReferencePlan, WorkbookOptions } from "./workbook-reference";
import type { ImportReport } from "./workbook-report";
import type { WorkbookState } from "./workbook-state";

export type StudentDraft = Omit<Student, "createdAt" | "updatedAt" | "history">;

export interface PlannedStudent {
  action: "create" | "update";
  draft: StudentDraft;
  /** History event appended on commit (by/at are stamped then). */
  event?: Omit<StudentEvent, "by" | "at">;
  existing?: Student;
}

const OPTIONAL_KEYS = ["dob", "gender", "note", "enrolledAt", "leftAt", "leftReason"] as const satisfies ReadonlyArray<keyof StudentDraft>;

function draftOf(s: Student): StudentDraft {
  const { createdAt: _c, updatedAt: _u, history: _h, ...rest } = s;
  return rest;
}

const FIELD_LABEL: Partial<Record<keyof StudentDraft, string>> = { name: "Họ tên", dob: "Ngày sinh", gender: "Giới tính", note: "Ghi chú", classCode: "Lớp" };

/** Marker of history events written by a workbook import ("… từ sổ nền nếp <file>"). */
const WORKBOOK_SOURCE = "sổ nền nếp ";

export function isWorkbookEvent(e: Pick<StudentEvent, "note">): boolean {
  return (e.note ?? "").includes(`từ ${WORKBOOK_SOURCE}`);
}

/** Has the student been changed outside workbook imports since the last workbook import (or ever, if never imported)? */
export function changedInAppSinceImport(s: Pick<Student, "history">): boolean {
  let last = -1;
  s.history.forEach((e, i) => {
    if (isWorkbookEvent(e)) last = i;
  });
  return s.history.slice(last + 1).some((e) => !isWorkbookEvent(e));
}

export function planStudents(
  payload: WorkbookPayload,
  options: WorkbookOptions,
  ref: ReferencePlan,
  state: WorkbookState,
  report: ImportReport,
): { writes: PlannedStudent[]; effective: Map<string, StudentLite> } {
  const effective = new Map<string, StudentLite>([...state.students.values()].map((s) => [s.id, toStudentLite(s)]));
  if (!options.students) {
    report.skipAll("students", payload.students.length);
    return { writes: [], effective };
  }
  const lookupClass = makeClassLookup(ref.classes);
  const firstRow = new Map<string, number>();
  const writes: PlannedStudent[] = [];
  const source = `${WORKBOOK_SOURCE}${payload.sourceFileName}`;
  const overwrite = options.overwriteAppChanges === true;
  const thisLevel = LEVELS[payload.levelId].short;

  payload.students.forEach((row, index) => {
    const rowNumber = row.rowNumber ?? index + 1;
    const id = row.id.trim();
    const name = cleanText(row.name);
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!id) errors.push("Thiếu mã HS.");
    if (!name) errors.push("Thiếu họ tên.");
    const cls = lookupClass(row.classCode);
    if (!row.classCode.trim()) errors.push("Thiếu lớp.");
    else {
      const problem = classProblem(row.classCode.trim(), cls);
      if (problem) errors.push(problem);
    }
    let promoteFrom: Student | undefined;
    if (id) {
      const first = firstRow.get(id);
      if (first !== undefined) errors.push(`Mã HS ${id} bị trùng với dòng ${first}.`);
      else firstRow.set(id, rowNumber);
      const other = state.otherLevelStudents.get(id);
      if (other?.status === "ACTIVE") {
        errors.push(`Mã HS ${id} đang học ở cấp ${LEVELS[other.levelId].short} (lớp ${other.classCode}) – nếu học sinh lên cấp, hãy chuyển cấp trong Quản lý học sinh.`);
      } else if (other) promoteFrom = other;
    }
    const dobRaw = (row.dob ?? "").trim();
    let dob: string | undefined = dobRaw || undefined;
    if (dob && !isIsoDate(dob)) {
      warnings.push(`Ngày sinh "${dobRaw}" không hợp lệ – bỏ qua.`);
      dob = undefined;
    }
    const gender = cleanText(row.gender) || undefined;
    const statusText = cleanText(row.statusText);
    const statusNote = statusText && normalizeVN(statusText) !== normalizeVN(STATUS_TEXT_ACTIVE) ? statusText : undefined;
    const existing = id ? state.students.get(id) : undefined;
    if (errors.length > 0 || !cls) {
      report.row("students", { rowNumber, key: id || name, errors, warnings, action: "skip" });
      return;
    }

    if (promoteFrom) {
      // Chuyển cấp: same school-wide Mã HS, history kept; the student is ACTIVE in this level from now on.
      const from = promoteFrom;
      const { leftAt: _l, leftReason: _r, ...kept } = draftOf(from);
      const draft = omitEmpty<StudentDraft>(
        { ...kept, name, dob: dob ?? from.dob, gender: gender ?? from.gender, levelId: payload.levelId, classCode: cls.code, grade: cls.grade, status: "ACTIVE" },
        OPTIONAL_KEYS,
      );
      warnings.push(
        `Học sinh mã ${id} chuyển cấp: ${LEVELS[from.levelId].short} (lớp ${from.classCode}, ${STUDENT_STATUS_LABELS[from.status]}) → ${thisLevel} lớp ${cls.code}.`,
      );
      const event: PlannedStudent["event"] = {
        type: "TRANSFER_IN",
        date: state.today,
        fromClass: from.classCode,
        toClass: cls.code,
        fromLevel: from.levelId,
        toLevel: payload.levelId,
        note: `Chuyển cấp từ ${LEVELS[from.levelId].name} – nhập từ ${source}`,
      };
      report.row("students", { rowNumber, key: id, warnings, action: "update" });
      writes.push({ action: "update", draft, event, existing: from });
      effective.set(id, toStudentLite(draft));
      return;
    }

    if (!existing) {
      const draft = omitEmpty<StudentDraft>(
        { id, name, dob, gender, levelId: payload.levelId, classCode: cls.code, grade: cls.grade, status: "ACTIVE", note: statusNote },
        OPTIONAL_KEYS,
      );
      const event = { type: "IMPORT" as const, date: state.today, toClass: cls.code, note: statusNote ? `Nhập từ ${source} – ${statusNote}` : `Nhập từ ${source}` };
      report.row("students", { rowNumber, key: id, warnings, action: "create" });
      writes.push({ action: "create", draft, event });
      effective.set(id, toStudentLite({ ...draft }));
      return;
    }

    const before = draftOf(existing);
    if (existing.status !== "ACTIVE") warnings.push(`Học sinh đang ở trạng thái "${STUDENT_STATUS_LABELS[existing.status]}" – giữ nguyên trạng thái.`);
    const draft = omitEmpty<StudentDraft>(
      { ...before, name, dob: dob ?? before.dob, gender: gender ?? before.gender, classCode: cls.code, grade: cls.grade, note: before.note ?? statusNote },
      OPTIONAL_KEYS,
    );
    const unchanged = canonicalJson(before) === canonicalJson(draft);
    if (!unchanged && !overwrite && changedInAppSinceImport(existing)) {
      const diffs = (["classCode", "name", "dob", "gender", "note"] as const)
        .filter((f) => before[f] !== draft[f])
        .map((f) => `${FIELD_LABEL[f]}: ${before[f] ?? "(trống)"} → ${draft[f] ?? "(trống)"}`);
      warnings.push(
        `Học sinh đã được cập nhật trong phần mềm sau lần nhập trước – giữ thông tin trong phần mềm, không cập nhật theo file (${diffs.join("; ")}). ` +
          "Chọn “Ghi đè thay đổi trong phần mềm” nếu muốn cập nhật theo file.",
      );
      report.row("students", { rowNumber, key: id, warnings, action: "skip" });
      return;
    }
    let event: PlannedStudent["event"];
    if (draft.classCode !== before.classCode) {
      event = { type: "TRANSFER_CLASS", date: state.today, fromClass: before.classCode, toClass: draft.classCode, note: `Cập nhật lớp từ ${source}` };
    } else if (!unchanged) {
      const fields = (["name", "dob", "gender", "note"] as const).filter((f) => before[f] !== draft[f]).map((f) => FIELD_LABEL[f]);
      event = { type: "UPDATE", date: state.today, note: `Cập nhật từ ${source}: ${fields.join(", ")}` };
    }
    report.row("students", { rowNumber, key: id, warnings, action: unchanged ? "skip" : "update" });
    if (!unchanged) writes.push({ action: "update", draft, event, existing });
    effective.set(id, toStudentLite(draft));
  });
  return { writes, effective };
}
