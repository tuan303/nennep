/**
 * Review queue (BR-RAG-02): incidents flagged REVIEW / THIẾU TÊN HS, grouped by issue code, plus the
 * "Bổ sung học sinh" quick fix (legacy-note name suggestions and a live preview computed by the engine). Pure – no React.
 */
import { editRuleContext } from "@/components/entry/lib/edit-context";
import { computeDataCheck, computePoints, normalizeCounts, validateIncidentRules } from "@/lib/engine/scoring";
import { nameSuggestions, normalizeVN } from "@/lib/engine/text";
import type { CatalogItem, ClassInfo, DataCheck, DataIssueCode, Incident, Scope, StudentLite } from "@/lib/types";
import type { IncidentUpdateInput } from "@/lib/contract";
import { compareIssueCodes, issueMeta, type IssueMeta } from "./issue-meta";

/** Incidents that need a reviewer: REVIEW first, then THIẾU TÊN HS; newest first inside each. */
export function reviewQueue(incidents: readonly Incident[]): Incident[] {
  const rank = (dc: DataCheck) => (dc === "REVIEW" ? 0 : 1);
  return incidents
    .filter((i) => i.dataCheck === "REVIEW" || i.dataCheck === "THIEU_TEN_HS")
    .sort((a, b) => rank(a.dataCheck) - rank(b.dataCheck) || (a.date === b.date ? (a.code < b.code ? 1 : -1) : a.date < b.date ? 1 : -1));
}

/** Distinct issue codes of an incident in display order (a flagged record without issues counts as "OTHER"/"UNNAMED_STUDENTS"). */
export function incidentIssueCodes(i: Pick<Incident, "dataIssues" | "dataCheck">): DataIssueCode[] {
  const codes = [...new Set(i.dataIssues.map((d) => d.code))];
  if (codes.length === 0) {
    if (i.dataCheck === "REVIEW") codes.push("OTHER");
    else if (i.dataCheck === "THIEU_TEN_HS") codes.push("UNNAMED_STUDENTS");
  }
  return codes.sort(compareIssueCodes);
}

export interface IssueGroup {
  code: DataIssueCode;
  meta: IssueMeta;
  /** Incidents carrying this issue (an incident with two issues is counted in both groups). */
  count: number;
}

export function issueGroups(queue: readonly Incident[]): IssueGroup[] {
  const counts = new Map<DataIssueCode, number>();
  for (const i of queue) for (const c of incidentIssueCodes(i)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => compareIssueCodes(a, b)).map(([code, count]) => ({ code, meta: issueMeta(code), count }));
}

export function filterByIssue(queue: readonly Incident[], code: DataIssueCode | "ALL"): Incident[] {
  if (code === "ALL") return [...queue];
  return queue.filter((i) => incidentIssueCodes(i).includes(code));
}

const LEGACY_PREFIX = "ghi chu trong file cu";

/** Text of the legacy-note issues without the "Ghi chú trong file cũ:" prefix, e.g. ["Trường Phúc"]. */
export function legacyNotes(i: Pick<Incident, "dataIssues">): string[] {
  return i.dataIssues
    .filter((d) => d.code === "LEGACY_NOTE")
    .map((d) => {
      const idx = d.message.indexOf(":");
      if (idx >= 0 && normalizeVN(d.message.slice(0, idx)) === LEGACY_PREFIX) return d.message.slice(idx + 1).trim();
      return d.message.trim();
    })
    .filter(Boolean);
}

/** Name-like fragments of a note: split on , ; / + "và" and line breaks; keeps 1–5 word parts without digits. */
export function namePartials(note: string): string[] {
  return note
    .split(/[,;/+\n|]|\s+-\s+|\s+và\s+/i)
    .map((p) => p.replace(/[()[\]"“”.:!?]/g, " ").trim().replace(/\s+/g, " "))
    .filter((p) => p.length >= 2 && !/\d/.test(p))
    .filter((p) => {
      const words = p.split(" ").length;
      return words >= 1 && words <= 5;
    });
}

/** One-tap suggestions for the legacy notes of an incident (engine `nameSuggestions` over the class roster). */
export function legacySuggestions(i: Pick<Incident, "dataIssues">, roster: readonly StudentLite[], limit = 8): StudentLite[] {
  const out: StudentLite[] = [];
  const seen = new Set<string>();
  for (const note of legacyNotes(i)) {
    for (const part of namePartials(note)) {
      for (const s of nameSuggestions(part, [...roster], 5)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** The "Bổ sung học sinh" quick fix applies to "/HS" incidents missing named students. */
export function canFixStudents(i: Pick<Incident, "unit" | "dataIssues" | "dataCheck">): boolean {
  if (i.unit !== "/HS") return false;
  const codes = incidentIssueCodes(i);
  return codes.includes("MISSING_STUDENTS") || codes.includes("UNNAMED_STUDENTS");
}

/** Issues the quick fix cannot solve (they need the full edit form). */
export function needsFullEdit(i: Pick<Incident, "dataIssues" | "dataCheck" | "unit">): boolean {
  return incidentIssueCodes(i).some((c) => issueMeta(c).fix === "edit") || !canFixStudents(i);
}

export interface FixDraft {
  studentIds: string[];
  unnamedCount: number;
  scope: Scope;
}

export function initialFixDraft(i: Pick<Incident, "students" | "unnamedCount" | "scope">): FixDraft {
  return { studentIds: i.students.map((s) => s.id), unnamedCount: i.unnamedCount, scope: i.scope };
}

/** "Số HS chưa rõ tên" is only allowed for "/HS" + Tập thể (NSHM decision). */
export function allowsUnnamed(unit: Incident["unit"], scope: Scope): boolean {
  return unit === "/HS" && scope === "Tập thể";
}

/** Catalog item as recorded on the incident (the server validates edits against this snapshot). */
export { snapshotCatalogItem } from "@/components/entry/lib/edit-context";

export interface FixPreview {
  points: number;
  dataCheck: DataCheck;
  errors: string[];
  namedCount: number;
  unnamedCount: number;
}

/**
 * What the record will look like after the fix – the same engine functions and rule context the server uses on PATCH
 * (editRuleContext + validateIncidentRules + computePoints + computeDataCheck, keeping only legacy notes as extra
 * issues). Students already on the record stay valid even if they transferred or withdrew since.
 */
export function fixPreview(
  i: Incident,
  draft: FixDraft,
  ctx: { classes: readonly ClassInfo[]; students: readonly StudentLite[]; today: string; catalog?: readonly CatalogItem[] },
): FixPreview {
  const counts = normalizeCounts(i.unit, draft.scope, i.occurrenceCount, draft.unnamedCount);
  // The quick fix never changes the class or the error: class kept, catalog snapshot.
  const rules = editRuleContext({
    original: i,
    classCode: i.classCode,
    errorCode: i.errorCode,
    roster: ctx.students,
    classes: ctx.classes,
    catalog: ctx.catalog ?? [],
    today: ctx.today,
  });
  const errors = validateIncidentRules(
    { date: i.date, classCode: i.classCode, errorCode: i.errorCode, scope: draft.scope, occurrenceCount: counts.occurrenceCount, studentIds: draft.studentIds, unnamedCount: counts.unnamedCount },
    rules,
  );
  const namedCount = draft.studentIds.length;
  const points = computePoints({ unit: i.unit, penalty: i.penalty, namedCount, unnamedCount: counts.unnamedCount, occurrenceCount: counts.occurrenceCount });
  const { dataCheck } = computeDataCheck({
    unit: i.unit,
    namedCount,
    unnamedCount: counts.unnamedCount,
    extraIssues: i.dataIssues.filter((d) => d.code === "LEGACY_NOTE"),
  });
  return { points, dataCheck, errors, namedCount, unnamedCount: counts.unnamedCount };
}

/** PATCH body of the quick fix. */
export function fixUpdateInput(i: Pick<Incident, "unit" | "rev">, draft: FixDraft): IncidentUpdateInput {
  return {
    studentIds: draft.studentIds,
    unnamedCount: allowsUnnamed(i.unit, draft.scope) ? Math.max(0, Math.floor(draft.unnamedCount)) : 0,
    scope: draft.scope,
    // The revision the dialog was opened from: 409 when the record changed meanwhile (no silent overwrite).
    baseRev: i.rev ?? 0,
  };
}

/** True when the draft differs from the stored incident. */
export function fixChanged(i: Pick<Incident, "students" | "unnamedCount" | "scope" | "unit">, draft: FixDraft): boolean {
  const before = initialFixDraft(i);
  const unnamed = allowsUnnamed(i.unit, draft.scope) ? draft.unnamedCount : 0;
  return (
    before.scope !== draft.scope ||
    before.unnamedCount !== unnamed ||
    before.studentIds.length !== draft.studentIds.length ||
    before.studentIds.some((id) => !draft.studentIds.includes(id))
  );
}
