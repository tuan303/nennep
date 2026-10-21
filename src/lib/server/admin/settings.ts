/**
 * Cài đặt (settings.manage): config, error catalog, classes, school weeks of a level.
 * Catalog and classes use REPLACE semantics without hard deletes: items missing from the list become inactive.
 * Every write goes through saveReferenceParts (canonical diff + `__ref` digest + version bump + audit in the last batch).
 */
import type { z } from "zod";
import { LEVELS } from "../../constants";
import type { CatalogPutSchema, ClassesPutSchema, ConfigUpdateSchema, WeeksPutSchema } from "../../contract";
import { generateWeeks, mondayOf } from "../../engine/dates";
import type { AuditAction, CatalogItem, ClassInfo, LevelConfig, LevelId, SchoolWeek } from "../../types";
import { auditDiff, auditOf, writeAudit } from "../audit";
import { requireLevel } from "../auth";
import { checkRemovedWeeks, type HiddenRecords } from "../calendar";
import { Errors } from "../errors";
import { nowIso } from "../firebase-admin";
import { omitEmpty, type ServiceCtx } from "../records";
import { readCanonicalReference, saveReferenceParts, sortWeeks, type LevelReference, type ReferencePatch } from "../reference";
import { EMAIL_RE, gradeAllowed } from "./common";
import { canonicalJson } from "./hash";

export type ConfigUpdateData = z.output<typeof ConfigUpdateSchema>;
export type CatalogPutData = z.output<typeof CatalogPutSchema>;
export type ClassesPutData = z.output<typeof ClassesPutSchema>;
export type WeeksPutData = z.output<typeof WeeksPutSchema>;

export const CONFIG_FIELDS = [
  "schoolYear",
  "baseScorePerWeek",
  "firstWeek",
  "semesters",
  "rag",
  "rewardCountedStatuses",
  "top90Ratio",
  "studentAlert",
  "actionSlaDays",
] as const satisfies ReadonlyArray<keyof LevelConfig>;

function duplicates(keys: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  return [...dup];
}

async function save(ctx: ServiceCtx, levelId: LevelId, patch: ReferencePatch, action: AuditAction, entity: string, detail: Record<string, unknown>): Promise<LevelReference> {
  return saveReferenceParts(levelId, patch, (b) => writeAudit(b, auditOf(ctx.user, action, { entity, entityId: levelId, levelId, ip: ctx.ip, detail })));
}

export interface CalendarChangeOptions {
  /** The admin confirmed that records of removed weeks may disappear from statistics (`?allowHidingRecords=1`). */
  allowHidingRecords?: boolean;
}

/** Audit detail of records hidden by a calendar change (only when there are some). */
function hiddenDetail(h: HiddenRecords): Record<string, unknown> {
  return h.incidents.length + h.rewards.length > 0 ? { hiddenRecords: { weeks: h.weeks, incidents: h.incidents.length, rewards: h.rewards.length } } : {};
}

/**
 * PUT /api/settings/:level/config — merge + validate; audit UPDATE_CONFIG with before/after of changed fields.
 * While the calendar is not stored (generated from firstWeek/semesters), a config change moves the calendar too:
 * weeks that disappear and still hold records need `allowHidingRecords` (409 otherwise).
 */
export async function putConfig(ctx: ServiceCtx, levelId: LevelId, input: ConfigUpdateData, opts: CalendarChangeOptions = {}): Promise<LevelConfig> {
  requireLevel(ctx.user, levelId);
  const existing = await readCanonicalReference(levelId);
  const before = existing.config;
  const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<LevelConfig>;
  const next: LevelConfig = { ...before, ...defined, levelId };
  next.rewardCountedStatuses = [...new Set(next.rewardCountedStatuses)];
  const errors: string[] = [];
  if (mondayOf(next.firstWeek) !== next.firstWeek) errors.push("Tuần đầu tiên phải là ngày Thứ Hai.");
  const semesters = [...next.semesters].sort((a, b) => a.start.localeCompare(b.start));
  if (duplicates(semesters.map((s) => s.code)).length > 0) errors.push("Mã học kỳ bị trùng.");
  for (const s of semesters) if (s.start > s.end) errors.push(`${s.name || s.code}: ngày bắt đầu sau ngày kết thúc.`);
  for (let i = 1; i < semesters.length; i++) {
    if (semesters[i].start <= semesters[i - 1].end) errors.push(`${semesters[i].name || semesters[i].code} chồng lấn với ${semesters[i - 1].name || semesters[i - 1].code}.`);
  }
  if (errors.length > 0) throw Errors.validationList(errors);
  next.semesters = semesters;
  const changes = auditDiff(before, next, CONFIG_FIELDS);
  if (Object.keys(changes).length === 0) return before;
  const hidden =
    existing.stored.weeks.size === 0 && (changes.firstWeek || changes.semesters)
      ? await checkRemovedWeeks(undefined, levelId, existing.weeks, generateWeeks(next.firstWeek, next.semesters), opts.allowHidingRecords)
      : undefined;
  const saved: LevelConfig = { ...next, updatedAt: nowIso(), updatedBy: ctx.user.email };
  const ref = await save(ctx, levelId, { config: saved }, "UPDATE_CONFIG", "config", { changes, ...(hidden ? hiddenDetail(hidden) : {}) });
  return ref.config;
}

/** Replace semantics: listed items are written as given; stored items missing from the list become inactive. */
function replaceKeepInactive<T extends { code: string; active: boolean }>(stored: Map<string, T>, items: T[]): { list: T[]; added: string[]; updated: string[]; deactivated: string[] } {
  const listed = new Set(items.map((i) => i.code));
  const added: string[] = [];
  const updated: string[] = [];
  const deactivated: string[] = [];
  for (const item of items) {
    const old = stored.get(item.code);
    if (!old) added.push(item.code);
    else if (canonicalJson(old) !== canonicalJson(item)) updated.push(item.code);
  }
  const kept: T[] = [];
  for (const [code, old] of stored) {
    if (listed.has(code)) continue;
    if (old.active) deactivated.push(code);
    kept.push({ ...old, active: false });
  }
  return { list: [...items, ...kept], added, updated, deactivated };
}

/** PUT /api/settings/:level/catalog — unique codes; missing items → active=false (never deleted). */
export async function putCatalog(ctx: ServiceCtx, levelId: LevelId, input: CatalogPutData): Promise<CatalogItem[]> {
  requireLevel(ctx.user, levelId);
  const dup = duplicates(input.items.map((i) => i.code));
  if (dup.length > 0) throw Errors.validation(`Mã lỗi bị trùng: ${dup.join(", ")}.`);
  const existing = await readCanonicalReference(levelId);
  const items: CatalogItem[] = input.items.map((i) => omitEmpty<CatalogItem>({ ...i }, ["group", "displayName"]));
  const r = replaceKeepInactive(existing.stored.catalog, items);
  if (r.added.length + r.updated.length + r.deactivated.length === 0) return existing.catalog;
  const ref = await save(ctx, levelId, { catalog: r.list }, "UPDATE_CATALOG", "catalog", { added: r.added, updated: r.updated, deactivated: r.deactivated });
  return ref.catalog;
}

/** PUT /api/settings/:level/classes — unique codes, grade of the level; missing classes → active=false. */
export async function putClasses(ctx: ServiceCtx, levelId: LevelId, input: ClassesPutData): Promise<ClassInfo[]> {
  requireLevel(ctx.user, levelId);
  const errors: string[] = [];
  const dup = duplicates(input.items.map((i) => i.code));
  if (dup.length > 0) errors.push(`Mã lớp bị trùng: ${dup.join(", ")}.`);
  for (const c of input.items) {
    if (!gradeAllowed(levelId, c.grade)) errors.push(`Lớp ${c.code}: khối ${c.grade} không thuộc cấp ${LEVELS[levelId].name}.`);
    const email = c.homeroomEmail?.trim();
    if (email && !EMAIL_RE.test(email)) errors.push(`Email GVCN của lớp ${c.code} không hợp lệ.`);
  }
  if (errors.length > 0) throw Errors.validationList(errors);
  const existing = await readCanonicalReference(levelId);
  const items: ClassInfo[] = input.items.map((c) =>
    omitEmpty<ClassInfo>({ ...c, levelId, homeroomEmail: c.homeroomEmail?.trim().toLowerCase() }, ["system", "homeroomTeacher", "deputyTeacher", "homeroomPhone", "homeroomEmail"]),
  );
  const r = replaceKeepInactive(existing.stored.classes, items);
  if (r.added.length + r.updated.length + r.deactivated.length === 0) return existing.classes;
  const ref = await save(ctx, levelId, { classes: r.list }, "UPDATE_CLASSES", "classes", { added: r.added, updated: r.updated, deactivated: r.deactivated });
  return ref.classes;
}

/**
 * PUT /api/settings/:level/weeks — replace the calendar, or regenerate Mondays from config.firstWeek to the end
 * of the last semester keeping the counted flag / note of weeks that already existed.
 * Removing weeks that still hold incidents/rewards hides those records: 409 listing them unless
 * `allowHidingRecords` (e.g. the school-year rollover). An unchanged calendar is not rewritten (no version bump).
 */
export async function putWeeks(ctx: ServiceCtx, levelId: LevelId, input: WeeksPutData, opts: CalendarChangeOptions = {}): Promise<SchoolWeek[]> {
  requireLevel(ctx.user, levelId);
  const existing = await readCanonicalReference(levelId);
  let weeks: SchoolWeek[];
  const regenerated = "regenerate" in input;
  if ("items" in input) {
    const errors: string[] = [];
    const dup = duplicates(input.items.map((w) => w.weekStart));
    if (dup.length > 0) errors.push(`Tuần bị trùng: ${dup.join(", ")}.`);
    const codes = new Set(existing.config.semesters.map((s) => s.code));
    for (const w of input.items) {
      if (mondayOf(w.weekStart) !== w.weekStart) errors.push(`Ngày ${w.weekStart} không phải Thứ Hai.`);
      if (w.semester && !codes.has(w.semester)) errors.push(`Tuần ${w.weekStart}: học kỳ "${w.semester}" không có trong cấu hình.`);
    }
    if (errors.length > 0) throw Errors.validationList(errors);
    weeks = input.items.map((w) => omitEmpty<SchoolWeek>({ ...w }, ["note"]));
  } else {
    const old = new Map(existing.weeks.map((w) => [w.weekStart, w]));
    weeks = generateWeeks(existing.config.firstWeek, existing.config.semesters).map((w) => {
      const prev = old.get(w.weekStart);
      return prev ? omitEmpty<SchoolWeek>({ ...w, counted: prev.counted, note: prev.note }, ["note"]) : w;
    });
  }
  if (existing.stored.weeks.size > 0 && canonicalJson(sortWeeks(weeks)) === canonicalJson(sortWeeks([...existing.stored.weeks.values()]))) {
    return existing.weeks;
  }
  const hidden = await checkRemovedWeeks(undefined, levelId, existing.weeks, weeks, opts.allowHidingRecords);
  const ref = await save(ctx, levelId, { weeks }, "UPDATE_WEEKS", "weeks", {
    regenerated,
    count: weeks.length,
    removed: hidden.weeks.length,
    notCounted: weeks.filter((w) => !w.counted).map((w) => w.weekStart),
    ...hiddenDetail(hidden),
  });
  return ref.weeks;
}
