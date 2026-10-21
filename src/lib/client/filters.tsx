"use client";
/**
 * Global filters, synced with the URL (?mode=&key=&grade=&class=&cat=&err=&group=&student=) – hook only, no provider needed.
 *
 * IMPORTANT: `useFilters()` uses `useSearchParams()`, so every component calling it must be rendered inside a
 * <Suspense> boundary (Next.js App Router requirement), and inside <DataProvider>.
 *
 * - Default period (no `mode` in the URL) = engine `defaultPeriod(weeks, todayVN())` and keeps following "today".
 * - Values are validated against the selected level's dataset (unknown class/error codes, groups and Mã HS are ignored;
 *   GVCN datasets only hold own-class students, so a GVCN can only filter on those).
 * - Changing level removes grade/class/err/group/student from the URL. `resetFilters()` keeps the period mode.
 * - Combine changes into ONE `setFilters({...})` call (each call issues a router.replace). Spreading the current
 *   filters is fine: consistency rules only react to fields whose value changes.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { defaultPeriod as engineDefaultPeriod, periodOptions } from "@/lib/engine/period";
import type { GlobalFilters, LevelId, Period } from "@/lib/types";
import { useDataset, useLevel } from "./data";
import {
  activeFilterCount,
  applyFilterPatch,
  buildFilterOptions,
  readFilterParams,
  resetPatch,
  resolveFilters,
  samePeriod,
  stripLevelScopedParams,
  writeFilterParams,
  type FilterContext,
  type FilterOptions,
  type FilterPatch,
} from "./filters-core";
import { useToday } from "./hooks";
import { useSession } from "./session";

export type { FilterOptions, FilterPatch, GradeOption, PeriodOptionSets, StudentFilterOption } from "./filters-core";
export type { PeriodOption } from "@/lib/engine/period";
export { activeFilterCount, FILTER_PARAMS } from "./filters-core";

export interface UseFiltersResult {
  filters: GlobalFilters;
  /** Merge a patch (pass `undefined` to clear a field) and write it to the URL (router.replace, no scroll). */
  setFilters: (patch: FilterPatch) => void;
  /** Clear grade/class/category/error/group/student; keep the period mode (key → current option of that mode). */
  resetFilters: () => void;
  options: FilterOptions;
  /** Engine default period for today. */
  defaultPeriod: Period;
  /** True when the effective period is the default one (no explicit period in the URL, or the same). */
  isDefaultPeriod: boolean;
  /** Number of active non-period filters. */
  activeCount: number;
}

const ALL: Period = { mode: "all" };

export function useFilters(): UseFiltersResult {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { levelId } = useLevel();
  const { dataset } = useDataset(levelId);
  const signedIn = useSession().status === "signedIn";
  const today = useToday();

  const search = searchParams.toString();
  const raw = useMemo(() => readFilterParams(new URLSearchParams(search)), [search]);

  const periods = useMemo(
    () => (dataset ? periodOptions(dataset.weeks, dataset.config.semesters, today) : undefined),
    [dataset, today],
  );
  const defPeriod = useMemo(() => (dataset ? engineDefaultPeriod(dataset.weeks, today) : ALL), [dataset, today]);

  const ctx = useMemo<FilterContext>(
    () => ({ levelId, dataset, periods, defaultPeriod: defPeriod }),
    [levelId, dataset, periods, defPeriod],
  );
  const filters = useMemo(() => resolveFilters(raw, ctx), [raw, ctx]);
  const options = useMemo(
    () =>
      buildFilterOptions({ levelId, dataset, periods, grade: filters.grade, classCode: filters.classCode, category: filters.category, group: filters.group }),
    [levelId, dataset, periods, filters.grade, filters.classCode, filters.category, filters.group],
  );

  const replace = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      if (qs === search) return;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, search],
  );

  const setFilters = useCallback(
    (patch: FilterPatch) => {
      const next = applyFilterPatch(filters, patch, ctx);
      // Pin the period in the URL only once the user picked one; otherwise keep following the default.
      const writePeriod = raw.mode !== undefined || !samePeriod(next.period, filters.period);
      replace(writeFilterParams(new URLSearchParams(search), next, writePeriod));
    },
    [filters, ctx, raw.mode, search, replace],
  );

  const resetFilters = useCallback(() => {
    const patch = resetPatch(filters);
    if (raw.mode === undefined) delete patch.period; // keep following the default period
    setFilters(patch);
  }, [filters, raw.mode, setFilters]);

  // Level switch by the user → drop level-scoped params (grade / class / error / group / student).
  // Not on the initial level resolution after sign-in (shared links keep their filters).
  const prevLevel = useRef<LevelId | undefined>(undefined);
  useEffect(() => {
    if (!signedIn) {
      prevLevel.current = undefined;
      return;
    }
    const prev = prevLevel.current;
    prevLevel.current = levelId;
    if (prev === undefined || prev === levelId) return;
    const stripped = stripLevelScopedParams(new URLSearchParams(search));
    if (stripped) replace(stripped);
  }, [signedIn, levelId, search, replace]);

  return useMemo(
    () => ({
      filters,
      setFilters,
      resetFilters,
      options,
      defaultPeriod: defPeriod,
      isDefaultPeriod: raw.mode === undefined || samePeriod(filters.period, defPeriod),
      activeCount: activeFilterCount(filters),
    }),
    [filters, setFilters, resetFilters, options, defPeriod, raw.mode],
  );
}
