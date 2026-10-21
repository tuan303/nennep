/**
 * Live preview of the incident form: points (engine computePoints) and validation (engine validateIncidentRules),
 * mirroring how the server treats creates and edits. Pure – unit-tested.
 */
import { calendarDateProblem, computePoints, normalizeCounts, validateIncidentRules, type PointsInput, type RuleContext } from "@/lib/engine";
import type { CatalogItem, Incident, LevelDataset, Unit } from "@/lib/types";
import { editRuleContext } from "./edit-context";
import type { EntryForm } from "./form-model";
import { checkEvidenceLinks } from "./links";

export { resolveCatalogItem, snapshotCatalogItem } from "./edit-context";

export const ENTRY_MSG = {
  noDate: "Chọn ngày ghi nhận.",
  noClass: "Chọn lớp.",
  noError: "Chọn lỗi vi phạm.",
} as const;

type EntryDataset = Pick<LevelDataset, "classes" | "catalog" | "students" | "weeks">;

/**
 * RULES-1 (server rule): a record can only be dated in a calendar week – otherwise it would be stored but invisible.
 * On edit, an unchanged date never blocks (the server only checks a changed date).
 */
export function entryCalendarProblem(weeks: LevelDataset["weeks"], date: string, original?: Pick<Incident, "date">): string | undefined {
  if (!date || (original && original.date === date)) return undefined;
  return calendarDateProblem(date, weeks);
}

/**
 * Rule context exactly as the server builds it (see `editRuleContext`): on edit with an unchanged class, the class
 * counts as active and the students already on the record stay valid with their snapshot class.
 */
export function entryRuleContext(ds: EntryDataset, form: EntryForm, today: string, original?: Incident): RuleContext {
  return editRuleContext({
    original,
    classCode: form.classCode,
    errorCode: form.errorCode,
    roster: ds.students,
    classes: ds.classes,
    catalog: ds.catalog,
    today,
  });
}

export interface EntryPreview {
  item?: CatalogItem;
  unit?: Unit;
  /** Counts actually sent to the API (normalised by unit/scope). */
  counts: { occurrenceCount: number; unnamedCount: number };
  /** "/HS" + "Tập thể": the "Số HS chưa rõ tên" stepper applies. */
  allowsUnnamed: boolean;
  namedCount: number;
  relatedCount: number;
  /** Rule-computed penalty points (0 until an error is chosen). */
  points: number;
  formula?: PointsInput;
  /** Everything that blocks saving, friendly Vietnamese, missing fields first. */
  issues: string[];
  canSave: boolean;
  /** Will be stored with dataCheck THIEU_TEN_HS. */
  flagsUnnamed: boolean;
  /** Valid evidence links to send. */
  urls: string[];
}

function isMissingFieldMessage(m: string, form: EntryForm): boolean {
  if (!form.date && m === "Ngày không hợp lệ.") return true;
  if (!form.classCode && m.startsWith('Lớp ""')) return true;
  if (!form.errorCode && m.startsWith('Mã lỗi ""')) return true;
  return false;
}

export function computeEntryPreview(ds: EntryDataset, form: EntryForm, today: string, original?: Incident): EntryPreview {
  const ctx = entryRuleContext(ds, form, today, original);
  const item = ctx.catalogItem;
  const counts = item
    ? normalizeCounts(item.unit, form.scope, form.occurrenceCount, form.unnamedCount)
    : { occurrenceCount: Math.max(1, Math.floor(form.occurrenceCount || 1)), unnamedCount: 0 };
  const namedCount = form.studentIds.length;
  const formula: PointsInput | undefined = item
    ? { unit: item.unit, penalty: item.penalty, namedCount, unnamedCount: counts.unnamedCount, occurrenceCount: counts.occurrenceCount }
    : undefined;

  const missing: string[] = [];
  if (!form.date) missing.push(ENTRY_MSG.noDate);
  if (!form.classCode) missing.push(ENTRY_MSG.noClass);
  if (!form.errorCode) missing.push(ENTRY_MSG.noError);
  const rules = validateIncidentRules(
    {
      date: form.date,
      classCode: form.classCode,
      errorCode: form.errorCode,
      scope: form.scope,
      occurrenceCount: counts.occurrenceCount,
      studentIds: form.studentIds,
      unnamedCount: counts.unnamedCount,
    },
    ctx,
  ).filter((m) => !isMissingFieldMessage(m, form));
  const links = checkEvidenceLinks(form.links);
  // Like the server: a future date already fails the rules, the calendar is only checked for dates up to today.
  const calendar = form.date <= today ? entryCalendarProblem(ds.weeks, form.date, original) : undefined;
  const issues = [...missing, ...(calendar ? [calendar] : []), ...rules, ...links.errors];

  return {
    item,
    unit: item?.unit,
    counts,
    allowsUnnamed: item?.unit === "/HS" && form.scope === "Tập thể",
    namedCount,
    relatedCount: namedCount + counts.unnamedCount,
    points: formula ? computePoints(formula) : 0,
    formula,
    issues,
    canSave: issues.length === 0,
    flagsUnnamed: counts.unnamedCount > 0,
    urls: links.urls,
  };
}
