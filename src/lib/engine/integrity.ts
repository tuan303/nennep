/**
 * Integrity re-check of STORED incidents (REQ_V2 §4.4, hạng mục 11 "lỗi công thức"): stored points / counts / student
 * classes that disagree with the business rules. Input must not be redacted; soft-deleted records are skipped.
 */
import type { Incident } from "../types";
import { computePoints, round2 } from "./scoring";
import { formatNumberVN, naturalCompare } from "./text";
import { compareStr } from "./utils";

export type IntegrityKind = "POINTS_FORMULA" | "STUDENT_COUNT" | "STUDENT_CLASS";

export interface IntegrityIssue {
  kind: IntegrityKind;
  incident: Incident;
  expected?: number;
  actual?: number;
  /** Vietnamese one-liner. */
  message: string;
}

const KIND_ORDER: Record<IntegrityKind, number> = { POINTS_FORMULA: 0, STUDENT_COUNT: 1, STUDENT_CLASS: 2 };

/**
 * - POINTS_FORMULA: points ≠ computePoints({ unit, penalty, namedCount: relatedStudentCount − unnamedCount, unnamedCount,
 *   occurrenceCount }) → "Điểm trừ lưu x khác công thức y" (expected = formula, actual = stored).
 * - STUDENT_COUNT: relatedStudentCount ≠ students.length + unnamedCount (expected = the sum, actual = stored).
 * - STUDENT_CLASS: a named student's snapshot classCode ≠ incident classCode and the record has no STUDENT_WRONG_CLASS
 *   issue (one item per incident listing the students).
 * Sorted by date desc, code, kind.
 */
export function integrityIssues(incidents: readonly Incident[]): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  for (const i of incidents) {
    if (i.deletedAt) continue;
    const unnamed = i.unnamedCount ?? 0;
    const expectedPoints = computePoints({
      unit: i.unit,
      penalty: i.penalty,
      namedCount: (i.relatedStudentCount ?? 0) - unnamed,
      unnamedCount: unnamed,
      occurrenceCount: i.occurrenceCount,
    });
    if (round2(i.points) !== expectedPoints) {
      out.push({
        kind: "POINTS_FORMULA",
        incident: i,
        expected: expectedPoints,
        actual: i.points,
        message: `Điểm trừ lưu ${formatNumberVN(i.points)} khác công thức ${formatNumberVN(expectedPoints)}`,
      });
    }

    const named = i.students.length;
    const expectedCount = named + unnamed;
    if (i.relatedStudentCount !== expectedCount) {
      out.push({
        kind: "STUDENT_COUNT",
        incident: i,
        expected: expectedCount,
        actual: i.relatedStudentCount,
        message: `HS liên quan lưu ${formatNumberVN(i.relatedStudentCount)} khác số thực tế ${expectedCount} (${named} ghi tên + ${unnamed} chưa rõ tên)`,
      });
    }

    const flagged = (i.dataIssues ?? []).some((d) => d.code === "STUDENT_WRONG_CLASS");
    const wrong = flagged ? [] : i.students.filter((s) => s.classCode && s.classCode !== i.classCode);
    if (wrong.length > 0) {
      out.push({
        kind: "STUDENT_CLASS",
        incident: i,
        message: `${wrong.map((s) => `${s.name} (${s.classCode})`).join(", ")} không thuộc lớp ${i.classCode} của sự việc`,
      });
    }
  }
  return out.sort(
    (a, b) =>
      compareStr(b.incident.date, a.incident.date) ||
      naturalCompare(a.incident.code, b.incident.code) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}
