/**
 * "Có thể trùng" tab and the integrity card of "Chất lượng dữ liệu" (REQ_V2 §7.3). Groups / issues come from the engine
 * (`findPossibleDuplicates`, `integrityIssues`); this module only labels, counts and builds the review requests.
 * Pure – unit-tested.
 */
import type { NotDuplicateInput } from "@/lib/contract";
import type { DuplicateGroup, IntegrityIssue, IntegrityKind } from "@/lib/engine";
import { round2 } from "@/lib/engine/scoring";
import type { Incident } from "@/lib/types";
import type { Tone } from "@/components/ui";

/* ------------------------------- duplicates ------------------------------- */

export const DUPLICATE_REASON_LABELS: Record<DuplicateGroup["reason"], string> = {
  SAME_STUDENTS: "Cùng học sinh",
  NO_NAMED_STUDENTS: "Đều không ghi tên học sinh",
};

export interface DuplicateTotals {
  groups: number;
  /** Records involved in the groups. */
  records: number;
  /** Σ extraPoints: penalty that may be counted twice. */
  extraPoints: number;
}

export function duplicateTotals(groups: readonly DuplicateGroup[]): DuplicateTotals {
  return {
    groups: groups.length,
    records: groups.reduce((n, g) => n + g.incidents.length, 0),
    extraPoints: round2(groups.reduce((n, g) => n + g.extraPoints, 0)),
  };
}

/** "Không trùng": POST /api/incidents/{first}/not-duplicate with every other member (marks every pair of the group). */
export function notDuplicateRequest(group: Pick<DuplicateGroup, "incidents">): { id: string; input: NotDuplicateInput } | undefined {
  const [first, ...others] = group.incidents;
  if (!first || others.length === 0) return undefined;
  return { id: first.id, input: { otherIds: others.map((i) => i.id).slice(0, 20) } };
}

/**
 * Reason prefilled when an admin deletes a member as the extra copy: "Trùng với NN-…" naming the oldest other member
 * (the record kept).
 */
export function duplicateDeleteReason(incident: Pick<Incident, "id">, group: Pick<DuplicateGroup, "incidents">): string {
  const kept = group.incidents.find((i) => i.id !== incident.id);
  return kept ? `Trùng với ${kept.code}` : "Ghi trùng";
}

/* -------------------------------- integrity ------------------------------- */

export interface IntegrityKindMeta {
  label: string;
  explanation: string;
  tone: Extract<Tone, "bad" | "warn" | "brand">;
}

export const INTEGRITY_KIND_META: Record<IntegrityKind, IntegrityKindMeta> = {
  POINTS_FORMULA: {
    label: "Sai công thức điểm",
    explanation: "Điểm trừ đã lưu khác điểm tính lại theo mức trừ × số HS / số lần.",
    tone: "bad",
  },
  STUDENT_COUNT: {
    label: "Sai số HS liên quan",
    explanation: "Số HS liên quan đã lưu khác số HS ghi tên + HS chưa rõ tên.",
    tone: "warn",
  },
  STUDENT_CLASS: {
    label: "HS không thuộc lớp",
    explanation: "Học sinh được ghi tên không thuộc lớp của sự việc (lúc ghi nhận).",
    tone: "warn",
  },
};

export const INTEGRITY_KINDS: readonly IntegrityKind[] = ["POINTS_FORMULA", "STUDENT_COUNT", "STUDENT_CLASS"];

/** Issues per kind (every kind listed, zeros included). */
export function integrityCounts(issues: readonly IntegrityIssue[]): Record<IntegrityKind, number> {
  const out: Record<IntegrityKind, number> = { POINTS_FORMULA: 0, STUDENT_COUNT: 0, STUDENT_CLASS: 0 };
  for (const i of issues) out[i.kind] += 1;
  return out;
}

/** Distinct incidents with at least one integrity issue. */
export function integrityIncidentCount(issues: readonly IntegrityIssue[]): number {
  return new Set(issues.map((i) => i.incident.id)).size;
}
