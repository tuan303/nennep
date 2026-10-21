/**
 * Workbook import – "HS liên quan" (IO-02): resolve the students linked to one incident.
 * By Mã HS first, then by normalised name inside the incident class. Unknown students are dropped
 * (STUDENT_NOT_FOUND), students of another class are kept with their real class (STUDENT_WRONG_CLASS),
 * repeated students are skipped (DUPLICATE_STUDENT).
 * History is validated at the incident date, not against today's roster (AC-019): a student the stored incident
 * already names keeps its snapshot, and a student who moved out of the incident class on/after the incident date
 * (history TRANSFER_CLASS / TRANSFER_OUT) is linked with the incident class.
 */
import type { ImportedLink } from "../../contract";
import { normalizeVN } from "../../engine/text";
import type { DataIssue, Student, StudentLite, StudentRef } from "../../types";
import { classKey, cleanText } from "./common";

export interface LinkOutcome {
  link: ImportedLink;
  errors: string[];
  warnings: string[];
  attached: boolean;
}

export interface ResolvedLinks {
  students: StudentRef[];
  issues: DataIssue[];
  outcomes: LinkOutcome[];
}

/** classCode → normalised name → students (for the name fallback). */
export type NameIndex = Map<string, Map<string, StudentLite[]>>;

export function buildNameIndex(students: Iterable<StudentLite>): NameIndex {
  const index: NameIndex = new Map();
  for (const s of students) {
    const byName = index.get(s.classCode) ?? new Map<string, StudentLite[]>();
    const key = normalizeVN(s.name);
    byName.set(key, [...(byName.get(key) ?? []), s]);
    index.set(s.classCode, byName);
  }
  return index;
}

function label(id: string | undefined, name: string): string {
  if (name && id) return `${name} (mã ${id})`;
  return name || `mã ${id}`;
}

/** Did the student leave `classCode` on or after `date` (so they were in it on that date)? */
export function leftClassOnOrAfter(student: Pick<Student, "history"> | undefined, classCode: string, date: string): boolean {
  if (!student) return false;
  return student.history.some(
    (e) => (e.type === "TRANSFER_CLASS" || e.type === "TRANSFER_OUT" || e.type === "REINSTATE") && e.fromClass === classCode && e.date >= date,
  );
}

export interface LinkContext {
  /** Student snapshots of the stored incident (kept as they are for the same student id). */
  existing?: readonly StudentRef[];
  /** Incident date (history check). */
  date?: string;
  /** Full student documents (history), by id. */
  history?: ReadonlyMap<string, Pick<Student, "history">>;
}

export function resolveLinks(
  links: readonly ImportedLink[],
  classCode: string,
  students: ReadonlyMap<string, StudentLite>,
  names: NameIndex,
  ctx: LinkContext = {},
): ResolvedLinks {
  const snapshots = new Map((ctx.existing ?? []).map((r) => [r.id, r]));
  const refs: StudentRef[] = [];
  const issues: DataIssue[] = [];
  const outcomes: LinkOutcome[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const id = link.studentId?.trim() || undefined;
    const name = cleanText(link.studentName);
    if (!id && !name) {
      outcomes.push({ link, errors: [], warnings: ["Dòng không có học sinh – bỏ qua."], attached: false });
      continue;
    }
    let student = id ? students.get(id) : undefined;
    let viaName = false;
    let ambiguous = 0;
    if (!student && name) {
      const candidates = names.get(classCode)?.get(normalizeVN(name)) ?? [];
      if (candidates.length === 1) {
        student = candidates[0];
        viaName = true;
      } else ambiguous = candidates.length;
    }
    if (!student) {
      const message =
        ambiguous > 1
          ? `Có ${ambiguous} học sinh tên ${name} trong lớp ${classCode} – cần ghi đúng mã HS.`
          : `Không tìm thấy học sinh ${label(id, name)} trong danh sách học sinh.`;
      issues.push({ code: "STUDENT_NOT_FOUND", message });
      outcomes.push({ link, errors: [message], warnings: [], attached: false });
      continue;
    }
    if (seen.has(student.id)) {
      const message = `${student.name} (mã ${student.id}) được liên kết nhiều lần – bỏ dòng trùng.`;
      issues.push({ code: "DUPLICATE_STUDENT", message });
      outcomes.push({ link, errors: [], warnings: [message], attached: false });
      continue;
    }
    seen.add(student.id);
    const warnings: string[] = [];
    if (viaName) warnings.push(`Không có mã HS – đã ghép theo họ tên với học sinh mã ${student.id}.`);
    const snapshot = snapshots.get(student.id);
    if (snapshot) {
      // Same student as stored: keep the snapshot (class at the time of recording), whatever happened since.
      if (snapshot.classCode !== classCode) {
        const message = `${snapshot.name} (mã ${snapshot.id}) thuộc lớp ${snapshot.classCode}, không phải lớp ${classCode}.`;
        issues.push({ code: "STUDENT_WRONG_CLASS", message });
        warnings.push(message);
      }
      refs.push(snapshot);
      outcomes.push({ link, errors: [], warnings, attached: true });
      continue;
    }
    const fileClass = link.studentClass?.trim();
    const wasInClass =
      student.classCode !== classCode &&
      (!fileClass || classKey(fileClass) === classKey(classCode)) &&
      !!ctx.date &&
      leftClassOnOrAfter(ctx.history?.get(student.id), classCode, ctx.date);
    if (student.classCode !== classCode && !wasInClass) {
      const message = `${student.name} (mã ${student.id}) thuộc lớp ${student.classCode}, không phải lớp ${classCode}.`;
      issues.push({ code: "STUDENT_WRONG_CLASS", message });
      warnings.push(message);
    }
    refs.push({ id: student.id, name: student.name, classCode: wasInClass ? classCode : student.classCode });
    outcomes.push({ link, errors: [], warnings, attached: true });
  }
  return { students: refs, issues, outcomes };
}
