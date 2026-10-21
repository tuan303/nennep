/**
 * Workbook import – reference sections (IO-04/05/06/08): classes and catalog are upserted (existing items keep
 * their active / is5S / order flags), config only when explicitly selected, weeks upserted keeping counted flags.
 * Pure planning: returns the effective reference used by the record sections and the patch to persist.
 */
import type { z } from "zod";
import { DEFAULT_5S_CODES, LEVELS } from "../../constants";
import type { WorkbookImportOptionsSchema, WorkbookPayload } from "../../contract";
import { generateWeeks, mondayOf } from "../../engine/dates";
import type { CatalogItem, ClassInfo, LevelConfig, LevelId, SchoolWeek, Semester } from "../../types";
import { omitEmpty } from "../records";
import { sortCatalog, sortClasses, sortWeeks, type CanonicalReference, type ReferencePatch } from "../reference";
import { EMAIL_RE, gradeAllowed, makeClassLookup } from "./common";
import { canonicalJson } from "./hash";
import type { ImportReport, RowAction } from "./workbook-report";
import { penaltyText } from "./workbook-text";

/** Section options + the request-level `overwriteAppChanges` choice (see WorkbookPreviewSchema). */
export type WorkbookOptions = z.output<typeof WorkbookImportOptionsSchema> & { overwriteAppChanges?: boolean };

export interface ReferencePlan {
  /** Parts to persist (only sections that change something). */
  patch: ReferencePatch;
  classes: ClassInfo[];
  catalog: CatalogItem[];
  config: LevelConfig;
  weeks: SchoolWeek[];
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

function actionFor<T>(stored: T | undefined, next: T): RowAction {
  if (!stored) return "create";
  return same(stored, next) ? "skip" : "update";
}

/** Copy of `base` where every defined, non-empty value of `patch` overrides. */
function overlay<T extends object>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch) as Array<[keyof T, T[keyof T] | undefined]>) {
    if (v !== undefined && v !== "") out[k] = v as T[keyof T];
  }
  return out;
}

function planClasses(levelId: LevelId, rows: WorkbookPayload["classes"], ref: CanonicalReference, report: ImportReport): { list: ClassInfo[]; changed: boolean } {
  const merged = new Map(ref.stored.classes);
  const lookup = makeClassLookup(ref.stored.classes.values());
  const seen = new Set<string>();
  let nextOrder = merged.size === 0 ? 0 : Math.max(...[...merged.values()].map((c) => c.order)) + 1;
  let changed = false;
  rows.forEach((row, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const existing = lookup(row.code);
    const code = existing?.code ?? row.code;
    if (!gradeAllowed(levelId, row.grade)) errors.push(`Khối ${row.grade} không thuộc cấp ${LEVELS[levelId].name}.`);
    if (seen.has(code)) errors.push(`Mã lớp ${code} bị trùng trong file.`);
    seen.add(code);
    const email = row.homeroomEmail?.trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) warnings.push(`Email GVCN không hợp lệ: ${row.homeroomEmail}.`);
    const fields: Partial<ClassInfo> = {
      grade: row.grade,
      system: row.system,
      homeroomTeacher: row.homeroomTeacher,
      deputyTeacher: row.deputyTeacher,
      homeroomPhone: row.homeroomPhone,
      homeroomEmail: email,
      sourceSize: row.sourceSize,
    };
    const base: ClassInfo = existing ?? { code, levelId, grade: row.grade, active: true, order: nextOrder };
    const next = omitEmpty(overlay({ ...base, code, levelId }, fields), ["system", "homeroomTeacher", "deputyTeacher", "homeroomPhone", "homeroomEmail"]);
    const action = actionFor(existing, next);
    if (report.row("classes", { rowNumber: i + 1, key: code, errors, warnings, action }) === "ERROR") return;
    if (!existing) nextOrder++;
    if (action !== "skip") changed = true;
    merged.set(code, next);
  });
  return { list: sortClasses([...merged.values()]), changed };
}

function planCatalog(rows: WorkbookPayload["catalog"], ref: CanonicalReference, report: ImportReport): { list: CatalogItem[]; changed: boolean } {
  const merged = new Map(ref.stored.catalog);
  const seen = new Set<string>();
  let changed = false;
  rows.forEach((row, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const code = row.code.trim();
    if (seen.has(code)) errors.push(`Mã lỗi ${code} bị trùng trong file.`);
    seen.add(code);
    if (!row.issue.trim()) errors.push("Thiếu nội dung lỗi.");
    if (!row.category.trim()) errors.push("Thiếu mảng (nhóm nội dung).");
    const existing = merged.get(code);
    if (existing && (existing.penalty !== row.penalty || existing.unit !== row.unit)) {
      warnings.push(
        `Điểm trừ thay đổi: ${penaltyText(existing.penalty, existing.unit)} → ${penaltyText(row.penalty, row.unit)} (chỉ áp dụng cho sự việc nhập mới hoặc nhập lại; sự việc đã ghi giữ nguyên điểm).`,
      );
    }
    const base: CatalogItem = existing ?? { code, category: row.category, issue: row.issue, penalty: row.penalty, unit: row.unit, is5S: DEFAULT_5S_CODES.includes(code), active: true };
    const next = overlay(base, { category: row.category.trim(), issue: row.issue.trim(), group: row.group, penalty: row.penalty, unit: row.unit, displayName: row.displayName });
    const action = actionFor(existing, next);
    if (report.row("catalog", { rowNumber: i + 1, key: code, errors, warnings, action }) === "ERROR") return;
    if (action !== "skip") changed = true;
    merged.set(code, next);
  });
  return { list: sortCatalog([...merged.values()]), changed };
}

function withSemester(list: Semester[], code: string, name: string, start: string | undefined, end: string | undefined): Semester[] {
  if (!start && !end) return list;
  const current = list.find((s) => s.code === code);
  const next: Semester = { code, name: current?.name ?? name, start: start ?? current?.start ?? "", end: end ?? current?.end ?? "" };
  return current ? list.map((s) => (s.code === code ? next : s)) : [...list, next];
}

function planConfig(config: WorkbookPayload["config"], ref: CanonicalReference, report: ImportReport): { config: LevelConfig; changed: boolean } {
  const current = ref.config;
  if (!config) return { config: current, changed: false };
  const errors: string[] = [];
  const warnings: string[] = [];
  let semesters = withSemester(current.semesters, "HK1", "Học kỳ I", config.hk1Start, config.hk1End);
  semesters = withSemester(semesters, "HK2", "Học kỳ II", config.hk2Start, config.hk2End);
  semesters = [...semesters].sort((a, b) => a.start.localeCompare(b.start));
  for (const s of semesters) if (!s.start || !s.end || s.start > s.end) errors.push(`${s.name}: ngày bắt đầu/kết thúc không hợp lệ.`);
  for (let i = 1; i < semesters.length; i++) {
    if (semesters[i].start <= semesters[i - 1].end) errors.push(`${semesters[i].name} bắt đầu trước khi ${semesters[i - 1].name} kết thúc.`);
  }
  let firstWeek = config.firstWeek ?? current.firstWeek;
  if (mondayOf(firstWeek) !== firstWeek) {
    warnings.push(`Tuần đầu tiên ${firstWeek} không phải Thứ Hai – dùng ${mondayOf(firstWeek)}.`);
    firstWeek = mondayOf(firstWeek);
  }
  const next: LevelConfig = { ...current, baseScorePerWeek: config.baseScorePerWeek ?? current.baseScorePerWeek, firstWeek, semesters };
  const action: RowAction = !ref.stored.config ? "create" : same(current, next) ? "skip" : "update";
  if (report.row("config", { rowNumber: 1, key: "Cấu hình", errors, warnings, action }) === "ERROR") return { config: current, changed: false };
  return { config: next, changed: action !== "skip" };
}

function planWeeks(rows: WorkbookPayload["weeks"], ref: CanonicalReference, config: LevelConfig, report: ImportReport): { list: SchoolWeek[]; changed: boolean } {
  const base = ref.stored.weeks.size > 0 ? [...ref.stored.weeks.values()] : generateWeeks(config.firstWeek, config.semesters);
  const merged = new Map(base.map((w) => [w.weekStart, w]));
  const semesterCodes = new Set(config.semesters.map((s) => s.code));
  const seen = new Set<string>();
  let changed = ref.stored.weeks.size === 0 && rows.length > 0;
  rows.forEach((row, i) => {
    const errors: string[] = [];
    if (mondayOf(row.weekStart) !== row.weekStart) errors.push(`Ngày ${row.weekStart} không phải Thứ Hai.`);
    if (seen.has(row.weekStart)) errors.push(`Tuần ${row.weekStart} bị trùng trong file.`);
    seen.add(row.weekStart);
    if (row.semester && !semesterCodes.has(row.semester)) errors.push(`Học kỳ "${row.semester}" không có trong cấu hình.`);
    const existing = merged.get(row.weekStart);
    const next: SchoolWeek = { ...(existing ?? { weekStart: row.weekStart, counted: true }), month: row.month, semester: row.semester };
    const action = actionFor(ref.stored.weeks.get(row.weekStart), next);
    if (report.row("weeks", { rowNumber: i + 1, key: row.weekStart, errors, action }) === "ERROR") return;
    if (action !== "skip") changed = true;
    merged.set(row.weekStart, next);
  });
  return { list: sortWeeks([...merged.values()]), changed };
}

/** Plan the reference sections; the returned lists are what incidents/students/rewards are validated against. */
export function planReference(payload: WorkbookPayload, options: WorkbookOptions, ref: CanonicalReference, report: ImportReport): ReferencePlan {
  const patch: ReferencePatch = {};
  let classes = ref.classes;
  if (options.classes) {
    const r = planClasses(payload.levelId, payload.classes, ref, report);
    classes = r.list;
    if (r.changed) patch.classes = r.list;
  } else report.skipAll("classes", payload.classes.length);

  let catalog = ref.catalog;
  if (options.catalog) {
    const r = planCatalog(payload.catalog, ref, report);
    catalog = r.list;
    if (r.changed) patch.catalog = r.list;
  } else report.skipAll("catalog", payload.catalog.length);

  let config = ref.config;
  if (options.config) {
    const r = planConfig(payload.config, ref, report);
    config = r.config;
    if (r.changed) patch.config = r.config;
  } else report.skipAll("config", payload.config ? 1 : 0);

  let weeks = ref.stored.weeks.size > 0 ? ref.weeks : generateWeeks(config.firstWeek, config.semesters);
  if (options.weeks) {
    const r = planWeeks(payload.weeks, ref, config, report);
    weeks = r.list;
    if (r.changed) patch.weeks = r.list;
  } else report.skipAll("weeks", payload.weeks.length);

  return { patch, classes, catalog, config, weeks };
}
