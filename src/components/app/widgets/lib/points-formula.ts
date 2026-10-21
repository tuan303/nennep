/** Human-readable points formula (BR-POINT-01/02), e.g. "2 điểm × 3 HS = 6" (pure – unit-tested). */
import { fmtNumber } from "@/lib/client/format";
import { computePoints, type PointsInput } from "@/lib/engine/scoring";
import type { Incident } from "@/lib/types";

export type FormulaInput = PointsInput;

export interface PointsFormula {
  /** "2 điểm × 3 HS = 6" */
  text: string;
  /** Points of the formula (the given total or the rule result). */
  total: number;
  /** 3 */
  multiplier: number;
  /** "HS" | "lần" */
  multiplierUnit: "HS" | "lần";
  /** Extra explanation, e.g. "2 HS có tên + 1 HS chưa rõ tên". */
  note?: string;
}

/** Fields of an incident needed to explain its points. */
export type FormulaIncident = Pick<Incident, "unit" | "penalty" | "students" | "unnamedCount" | "occurrenceCount" | "relatedStudentCount">;

/**
 * Formula for a draft or stored incident. `total` overrides the rule result (stored incidents keep the server value).
 * "/HS": penalty × (named + unnamed); "/lần": penalty × occurrences (never multiplied by students).
 */
export function pointsFormula(input: FormulaInput, total?: number): PointsFormula {
  const computed = computePoints(input);
  const t = total ?? computed;
  const p = fmtNumber(input.penalty);
  if (input.unit === "/HS") {
    const named = Math.max(0, input.namedCount);
    const unnamed = Math.max(0, input.unnamedCount);
    const m = named + unnamed;
    const note = unnamed > 0 ? `${fmtNumber(named)} HS có tên + ${fmtNumber(unnamed)} HS chưa rõ tên` : undefined;
    return { text: `${p} điểm × ${fmtNumber(m)} HS = ${fmtNumber(t)}`, total: t, multiplier: m, multiplierUnit: "HS", note };
  }
  const m = Math.max(1, Math.floor(input.occurrenceCount || 1));
  return { text: `${p} điểm × ${fmtNumber(m)} lần = ${fmtNumber(t)}`, total: t, multiplier: m, multiplierUnit: "lần" };
}

/**
 * Formula input of a stored incident. Redacted incidents (GVCN, other classes) have `students = []` but keep
 * `relatedStudentCount`, so the named count is derived from it when larger.
 */
export function formulaInputOf(i: FormulaIncident): FormulaInput {
  const unnamed = Math.max(0, i.unnamedCount || 0);
  const named = Math.max(i.students.length, (i.relatedStudentCount || 0) - unnamed);
  return { unit: i.unit, penalty: i.penalty, namedCount: named, unnamedCount: unnamed, occurrenceCount: i.occurrenceCount };
}
