/**
 * Rule context of an incident create / edit – ONE implementation used by the server (`resolveEditContext` in
 * src/lib/server/incidents.ts, PATCH /api/incidents/:id), the entry form preview and the "Bổ sung học sinh" quick
 * fix, so the Save buttons always agree with what the server accepts (RULES-2 / RULES-11). Pure.
 *
 * - Create, or an edit that changes the class: the current class and roster.
 * - Edit that keeps the class: the class counts as active, and every student already on the record stays valid as
 *   ACTIVE with the class of its snapshot – a student who transferred or withdrew since does not block the edit, while
 *   a legacy record whose snapshot class differs (STUDENT_WRONG_CLASS) still fails exactly like on the server.
 * - Edit that keeps the error code: the catalog snapshot stored on the record (penalty / unit at recording time).
 */
import type { CatalogItem, ClassInfo, Incident, StudentLite } from "../types";
import type { RuleContext } from "./scoring";

type CatalogSnapshot = Pick<Incident, "errorCode" | "category" | "issue" | "group" | "penalty" | "unit">;

/** The fields of the stored record the edit rules depend on. */
export type EditOriginal = CatalogSnapshot & Pick<Incident, "levelId" | "classCode" | "grade" | "students">;

/** Catalog item stored on an incident (edits keep it while the error code is unchanged – server rule). */
export function snapshotCatalogItem(i: CatalogSnapshot): CatalogItem {
  const item: CatalogItem = { code: i.errorCode, category: i.category, issue: i.issue, penalty: i.penalty, unit: i.unit, is5S: false, active: true };
  if (i.group) item.group = i.group;
  return item;
}

/** Catalog item used for points / validation: the stored snapshot when editing without changing the error. */
export function resolveCatalogItem(catalog: readonly CatalogItem[], errorCode: string, original?: CatalogSnapshot): CatalogItem | undefined {
  if (!errorCode) return undefined;
  if (original && original.errorCode === errorCode) return snapshotCatalogItem(original);
  return catalog.find((c) => c.code === errorCode);
}

export interface EditRuleContextArgs {
  /** The stored record (edit); undefined for a create. */
  original?: EditOriginal;
  /** Class and error code of the form / patch. */
  classCode: string;
  errorCode: string;
  /** Students of the level as known now (the server passes the ones it loaded). */
  roster: Iterable<StudentLite>;
  classes: readonly ClassInfo[];
  catalog: readonly CatalogItem[];
  today: string;
}

export function editRuleContext({ original, classCode, errorCode, roster, classes, catalog, today }: EditRuleContextArgs): RuleContext {
  const kept = original && original.classCode === classCode ? original : undefined;
  const current = classes.find((c) => c.code === classCode);
  const classInfo: ClassInfo | undefined = kept
    ? { ...(current ?? { code: kept.classCode, levelId: kept.levelId, grade: kept.grade, order: 0 }), active: true }
    : current;
  const studentsById = new Map<string, StudentLite>();
  for (const s of roster) studentsById.set(s.id, s);
  if (kept) {
    for (const s of kept.students) studentsById.set(s.id, { id: s.id, name: s.name, classCode: s.classCode, grade: kept.grade, status: "ACTIVE" });
  }
  return { catalogItem: resolveCatalogItem(catalog, errorCode, original), classInfo, studentsById, today };
}
