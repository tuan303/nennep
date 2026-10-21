/**
 * Pure logic behind useFilters(): URL params ⇄ GlobalFilters, validation against the dataset, patch rules
 * and picker options. No React / Next imports (unit-tested).
 *
 * URL params: ?mode=week|month|semester|all &key=… &grade=6 &class=6A01 &cat=<Mảng> &err=L04
 */
import { LEVELS } from "@/lib/constants";
import type { PeriodOption } from "@/lib/engine/period";
import type { CatalogItem, ClassInfo, GlobalFilters, LevelDataset, LevelId, Period, PeriodMode } from "@/lib/types";

export const FILTER_PARAMS = {
  mode: "mode",
  key: "key",
  grade: "grade",
  classCode: "class",
  category: "cat",
  errorCode: "err",
} as const;

/** Params cleared when the level changes. */
export const LEVEL_SCOPED_PARAMS = [FILTER_PARAMS.grade, FILTER_PARAMS.classCode, FILTER_PARAMS.errorCode] as const;

const PERIOD_MODES: readonly PeriodMode[] = ["all", "week", "month", "semester"];
const KEY_FORMAT: Record<Exclude<PeriodMode, "all">, RegExp> = {
  week: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  semester: /^[\w-]{1,10}$/,
};

const naturalCollator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export interface RawFilterParams {
  mode?: string;
  key?: string;
  grade?: string;
  classCode?: string;
  category?: string;
  errorCode?: string;
}

export interface PeriodOptionSets {
  weeks: PeriodOption[];
  months: PeriodOption[];
  semesters: PeriodOption[];
}

export interface GradeOption {
  value: number;
  label: string; // "Khối 6"
}

export interface FilterOptions extends PeriodOptionSets {
  grades: GradeOption[];
  /** Active classes (of the selected grade, if any), sorted by grade then natural class code. */
  classes: ClassInfo[];
  /** Unique catalog categories (Mảng) in catalog order. */
  categories: string[];
  /** Catalog items (of the selected category, if any), catalog order. Includes inactive items (history). */
  errors: CatalogItem[];
}

/** Everything needed to validate filters. `dataset`/`periods` are undefined while the dataset loads. */
export interface FilterContext {
  levelId: LevelId;
  dataset?: Pick<LevelDataset, "classes" | "catalog">;
  periods?: PeriodOptionSets;
  defaultPeriod: Period;
}

/** Fields to change; pass `undefined` to clear one. `period.key` may be omitted → default key for that mode. */
export interface FilterPatch {
  period?: { mode: PeriodMode; key?: string };
  grade?: number;
  classCode?: string;
  category?: string;
  errorCode?: string;
}

function clean(s: string | null | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

export function readFilterParams(sp: { get(name: string): string | null }): RawFilterParams {
  return {
    mode: clean(sp.get(FILTER_PARAMS.mode)),
    key: clean(sp.get(FILTER_PARAMS.key)),
    grade: clean(sp.get(FILTER_PARAMS.grade)),
    classCode: clean(sp.get(FILTER_PARAMS.classCode)),
    category: clean(sp.get(FILTER_PARAMS.category)),
    errorCode: clean(sp.get(FILTER_PARAMS.errorCode)),
  };
}

function isPeriodMode(v: string | undefined): v is PeriodMode {
  return v !== undefined && (PERIOD_MODES as readonly string[]).includes(v);
}

export function optionsForMode(periods: PeriodOptionSets, mode: PeriodMode): PeriodOption[] {
  if (mode === "week") return periods.weeks;
  if (mode === "month") return periods.months;
  if (mode === "semester") return periods.semesters;
  return [];
}

/** Default key when switching to `mode`: engine default if same mode, else current → last past → first option. */
export function defaultKeyForMode(periods: PeriodOptionSets | undefined, mode: PeriodMode, fallback: Period): string | undefined {
  if (mode === "all") return undefined;
  if (fallback.mode === mode && fallback.key) return fallback.key;
  const opts = periods ? optionsForMode(periods, mode) : [];
  const current = opts.find((o) => o.isCurrent);
  if (current) return current.key;
  const past = opts.filter((o) => !o.isFuture);
  return (past.length ? past[past.length - 1] : opts[0])?.key;
}

function resolvePeriod(raw: RawFilterParams, ctx: FilterContext): Period {
  const mode = isPeriodMode(raw.mode) ? raw.mode : undefined;
  if (!mode) return ctx.defaultPeriod;
  if (mode === "all") return { mode: "all" };
  if (ctx.periods) {
    if (raw.key && optionsForMode(ctx.periods, mode).some((o) => o.key === raw.key)) return { mode, key: raw.key };
    const key = defaultKeyForMode(ctx.periods, mode, ctx.defaultPeriod);
    return key ? { mode, key } : ctx.defaultPeriod;
  }
  if (raw.key && KEY_FORMAT[mode].test(raw.key)) return { mode, key: raw.key };
  return ctx.defaultPeriod;
}

function findClass(ctx: FilterContext, code: string): ClassInfo | undefined {
  return ctx.dataset?.classes.find((c) => c.code === code);
}

function findError(ctx: FilterContext, code: string): CatalogItem | undefined {
  return ctx.dataset?.catalog.find((i) => i.code === code);
}

/** Drop undefined keys so filters compare/serialise cleanly. */
function compact(f: GlobalFilters): GlobalFilters {
  const out: GlobalFilters = { period: f.period };
  if (f.grade !== undefined) out.grade = f.grade;
  if (f.classCode !== undefined) out.classCode = f.classCode;
  if (f.category !== undefined) out.category = f.category;
  if (f.errorCode !== undefined) out.errorCode = f.errorCode;
  return out;
}

/** URL params → validated filters (invalid values are ignored; full checks once the dataset is loaded). */
export function resolveFilters(raw: RawFilterParams, ctx: FilterContext): GlobalFilters {
  const period = resolvePeriod(raw, ctx);
  const gradeNum = raw.grade !== undefined && /^\d{1,2}$/.test(raw.grade) ? Number(raw.grade) : undefined;
  const grade = gradeNum !== undefined && LEVELS[ctx.levelId].grades.includes(gradeNum) ? gradeNum : undefined;

  let classCode = raw.classCode;
  if (classCode && ctx.dataset) {
    const c = findClass(ctx, classCode);
    if (!c || (grade !== undefined && c.grade !== grade)) classCode = undefined;
  }

  let category = raw.category;
  if (category && ctx.dataset && !ctx.dataset.catalog.some((i) => i.category === category)) category = undefined;

  let errorCode = raw.errorCode;
  if (errorCode && ctx.dataset) {
    const item = findError(ctx, errorCode);
    if (!item || (category !== undefined && item.category !== category)) errorCode = undefined;
  }
  return compact({ period, grade, classCode, category, errorCode });
}

/**
 * Apply a patch with consistency rules. Only fields whose value actually changes trigger a rule, so spreading
 * the current filters (`setFilters({ ...filters, grade: 7 })`) behaves like `setFilters({ grade: 7 })`:
 * - grade changed → a class of another grade is cleared; class changed → grade follows the class when they differ;
 * - category changed → an error of another category is cleared; error changed → category follows the error.
 * Empty strings clear a field.
 */
export function applyFilterPatch(current: GlobalFilters, patch: FilterPatch, ctx: FilterContext): GlobalFilters {
  const next: GlobalFilters = { ...current };
  if (patch.period) {
    const { mode } = patch.period;
    if (mode === "all") next.period = { mode: "all" };
    else {
      const key = patch.period.key || defaultKeyForMode(ctx.periods, mode, ctx.defaultPeriod);
      next.period = key ? { mode, key } : ctx.defaultPeriod;
    }
  }
  const str = (v: string | undefined) => v?.trim() || undefined;
  const grade = "grade" in patch ? patch.grade : current.grade;
  const classCode = "classCode" in patch ? str(patch.classCode) : current.classCode;
  const category = "category" in patch ? str(patch.category) : current.category;
  const errorCode = "errorCode" in patch ? str(patch.errorCode) : current.errorCode;

  if (grade !== current.grade) {
    next.grade = grade;
    if (grade !== undefined && next.classCode) {
      const c = findClass(ctx, next.classCode);
      if (!c || c.grade !== grade) next.classCode = undefined;
    }
  }
  if (classCode !== current.classCode) {
    next.classCode = classCode;
    const c = classCode ? findClass(ctx, classCode) : undefined;
    if (c && next.grade !== undefined && c.grade !== next.grade) next.grade = c.grade;
  }
  if (category !== current.category) {
    next.category = category;
    if (category !== undefined && next.errorCode) {
      const item = findError(ctx, next.errorCode);
      if (!item || item.category !== category) next.errorCode = undefined;
    }
  }
  if (errorCode !== current.errorCode) {
    next.errorCode = errorCode;
    const item = errorCode ? findError(ctx, errorCode) : undefined;
    if (item && next.category !== undefined && item.category !== next.category) next.category = item.category;
  }
  return compact(next);
}

/** Patch used by resetFilters(): clear every filter; keep the period mode (key → default of that mode). */
export function resetPatch(current: GlobalFilters): FilterPatch {
  return {
    period: { mode: current.period.mode },
    grade: undefined,
    classCode: undefined,
    category: undefined,
    errorCode: undefined,
  };
}

/**
 * Write filters into a copy of `base` (other params are preserved).
 * The period is written only when `writePeriod` (user picked one) – otherwise the URL keeps following the default.
 */
export function writeFilterParams(base: URLSearchParams, f: GlobalFilters, writePeriod: boolean): URLSearchParams {
  const p = new URLSearchParams(base);
  const set = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === "") p.delete(name);
    else p.set(name, String(value));
  };
  if (writePeriod) {
    set(FILTER_PARAMS.mode, f.period.mode);
    set(FILTER_PARAMS.key, f.period.mode === "all" ? undefined : f.period.key);
  }
  set(FILTER_PARAMS.grade, f.grade);
  set(FILTER_PARAMS.classCode, f.classCode);
  set(FILTER_PARAMS.category, f.category);
  set(FILTER_PARAMS.errorCode, f.errorCode);
  return p;
}

/** Remove grade/class/err (level switch). Returns undefined when nothing had to change. */
export function stripLevelScopedParams(base: URLSearchParams): URLSearchParams | undefined {
  if (!LEVEL_SCOPED_PARAMS.some((k) => base.has(k))) return undefined;
  const p = new URLSearchParams(base);
  for (const k of LEVEL_SCOPED_PARAMS) p.delete(k);
  return p;
}

export function compareClassCodes(a: ClassInfo, b: ClassInfo): number {
  return a.grade - b.grade || naturalCollator.compare(a.code, b.code);
}

export function buildFilterOptions(args: {
  levelId: LevelId;
  dataset?: Pick<LevelDataset, "classes" | "catalog">;
  periods?: PeriodOptionSets;
  grade?: number;
  category?: string;
}): FilterOptions {
  const { levelId, dataset, periods, grade, category } = args;
  const classes = (dataset?.classes ?? [])
    .filter((c) => c.active && (grade === undefined || c.grade === grade))
    .sort(compareClassCodes);
  const catalog = dataset?.catalog ?? [];
  const categories: string[] = [];
  for (const item of catalog) if (item.category && !categories.includes(item.category)) categories.push(item.category);
  return {
    weeks: periods?.weeks ?? [],
    months: periods?.months ?? [],
    semesters: periods?.semesters ?? [],
    grades: LEVELS[levelId].grades.map((g) => ({ value: g, label: `Khối ${g}` })),
    classes,
    categories,
    errors: category === undefined ? catalog : catalog.filter((i) => i.category === category),
  };
}

/** Number of active non-period filters (grade, class, category, error) – e.g. for a badge on the filter button. */
export function activeFilterCount(f: GlobalFilters): number {
  return [f.grade, f.classCode, f.category, f.errorCode].filter((v) => v !== undefined).length;
}

export function samePeriod(a: Period, b: Period): boolean {
  return a.mode === b.mode && (a.mode === "all" || a.key === b.key);
}
