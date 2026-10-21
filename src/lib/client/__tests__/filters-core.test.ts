import { describe, expect, it } from "vitest";
import { defaultLevelConfig } from "@/lib/constants";
import { generateWeeks } from "@/lib/engine/dates";
import { defaultPeriod, periodOptions } from "@/lib/engine/period";
import type { CatalogItem, ClassInfo, GlobalFilters } from "@/lib/types";
import {
  activeFilterCount,
  applyFilterPatch,
  buildFilterOptions,
  defaultKeyForMode,
  readFilterParams,
  resetPatch,
  resolveFilters,
  stripLevelScopedParams,
  writeFilterParams,
  type FilterContext,
} from "../filters-core";

const TODAY = "2026-10-21"; // Wednesday → current week 2026-10-19, month 2026-10, HK1
const config = defaultLevelConfig("THCS");
const weeks = generateWeeks(config.firstWeek, config.semesters);
const periods = periodOptions(weeks, config.semesters, TODAY);

const cls = (code: string, grade: number, active = true): ClassInfo => ({ code, levelId: "THCS", grade, active, order: 0 });
const err = (code: string, category: string): CatalogItem => ({
  code,
  category,
  issue: `Lỗi ${code}`,
  penalty: 2,
  unit: "/HS",
  is5S: false,
  active: true,
});

const classes = [cls("6A10", 6), cls("7A01", 7), cls("6A2", 6), cls("6A01", 6), cls("6A03", 6, false)];
const catalog = [err("L01", "Chuyên cần"), err("L04", "Vệ sinh"), err("L05", "Chuyên cần")];

const ctx: FilterContext = {
  levelId: "THCS",
  dataset: { classes, catalog },
  periods,
  defaultPeriod: defaultPeriod(weeks, TODAY),
};
const loadingCtx: FilterContext = { levelId: "THCS", defaultPeriod: { mode: "all" } };
const params = (qs: string) => readFilterParams(new URLSearchParams(qs));

describe("readFilterParams", () => {
  it("reads and trims the documented params", () => {
    expect(params("mode=week&key=2026-10-12&grade=6&class=%206A01%20&cat=V%E1%BB%87%20sinh&err=L04&x=1")).toEqual({
      mode: "week",
      key: "2026-10-12",
      grade: "6",
      classCode: "6A01",
      category: "Vệ sinh",
      errorCode: "L04",
    });
    expect(params("class=&grade=")).toEqual({
      mode: undefined,
      key: undefined,
      grade: undefined,
      classCode: undefined,
      category: undefined,
      errorCode: undefined,
    });
  });
});

describe("resolveFilters", () => {
  it("uses the engine default period when the URL has none", () => {
    expect(resolveFilters(params(""), ctx)).toEqual({ period: { mode: "week", key: "2026-10-19" } });
  });

  it("accepts valid values", () => {
    expect(resolveFilters(params("mode=month&key=2026-09&grade=6&class=6A01&cat=Chuyên cần&err=L05"), ctx)).toEqual({
      period: { mode: "month", key: "2026-09" },
      grade: 6,
      classCode: "6A01",
      category: "Chuyên cần",
      errorCode: "L05",
    });
    expect(resolveFilters(params("mode=all&key=whatever"), ctx)).toEqual({ period: { mode: "all" } });
  });

  it("drops values that do not fit the level / dataset", () => {
    expect(resolveFilters(params("grade=10"), ctx).grade).toBeUndefined(); // not a THCS grade
    expect(resolveFilters(params("grade=abc"), ctx).grade).toBeUndefined();
    expect(resolveFilters(params("class=9Z99"), ctx).classCode).toBeUndefined();
    expect(resolveFilters(params("grade=7&class=6A01"), ctx)).toEqual({ period: ctx.defaultPeriod, grade: 7 });
    expect(resolveFilters(params("cat=Không có"), ctx).category).toBeUndefined();
    expect(resolveFilters(params("cat=Vệ sinh&err=L01"), ctx)).toEqual({ period: ctx.defaultPeriod, category: "Vệ sinh" });
    expect(resolveFilters(params("err=L99"), ctx).errorCode).toBeUndefined();
  });

  it("replaces an unknown period key by the default key of that mode", () => {
    expect(resolveFilters(params("mode=month&key=2031-01"), ctx).period).toEqual({ mode: "month", key: "2026-10" });
    expect(resolveFilters(params("mode=semester"), ctx).period).toEqual({ mode: "semester", key: "HK1" });
    expect(resolveFilters(params("mode=bogus&key=1"), ctx).period).toEqual(ctx.defaultPeriod);
  });

  it("only checks the syntax while the dataset is loading", () => {
    expect(resolveFilters(params("mode=week&key=2026-10-12&class=6A01&err=L99"), loadingCtx)).toEqual({
      period: { mode: "week", key: "2026-10-12" },
      classCode: "6A01",
      errorCode: "L99",
    });
    expect(resolveFilters(params("mode=week&key=12/10"), loadingCtx).period).toEqual({ mode: "all" });
  });
});

describe("defaultKeyForMode", () => {
  it("prefers the engine default, then the current option, then the last past option", () => {
    expect(defaultKeyForMode(periods, "week", ctx.defaultPeriod)).toBe("2026-10-19");
    expect(defaultKeyForMode(periods, "month", ctx.defaultPeriod)).toBe("2026-10");
    expect(defaultKeyForMode(periods, "all", ctx.defaultPeriod)).toBeUndefined();
    const summer = periodOptions(weeks, config.semesters, "2027-07-15");
    expect(defaultKeyForMode(summer, "month", { mode: "all" })).toBe("2027-05");
  });
});

describe("applyFilterPatch", () => {
  const base: GlobalFilters = { period: { mode: "week", key: "2026-10-19" } };

  it("fills the default key when only the mode changes", () => {
    expect(applyFilterPatch(base, { period: { mode: "month" } }, ctx).period).toEqual({ mode: "month", key: "2026-10" });
    expect(applyFilterPatch(base, { period: { mode: "all", key: "x" } }, ctx).period).toEqual({ mode: "all" });
    expect(applyFilterPatch(base, { period: { mode: "week", key: "2026-09-07" } }, ctx).period).toEqual({
      mode: "week",
      key: "2026-09-07",
    });
  });

  it("clears a class that does not belong to the new grade", () => {
    const f = { ...base, grade: 6, classCode: "6A01" };
    expect(applyFilterPatch(f, { grade: 7 }, ctx)).toEqual({ ...base, grade: 7 });
    expect(applyFilterPatch(f, { grade: 6 }, ctx)).toEqual(f);
    expect(applyFilterPatch(f, { grade: undefined }, ctx)).toEqual({ ...base, classCode: "6A01" });
  });

  it("aligns the grade with a chosen class", () => {
    expect(applyFilterPatch({ ...base, grade: 6 }, { classCode: "7A01" }, ctx)).toEqual({ ...base, grade: 7, classCode: "7A01" });
    expect(applyFilterPatch(base, { classCode: "7A01" }, ctx)).toEqual({ ...base, classCode: "7A01" });
    expect(applyFilterPatch({ ...base, classCode: "7A01" }, { classCode: "" }, ctx)).toEqual(base);
  });

  it("keeps category and error consistent", () => {
    const f = { ...base, category: "Chuyên cần", errorCode: "L01" };
    expect(applyFilterPatch(f, { category: "Vệ sinh" }, ctx)).toEqual({ ...base, category: "Vệ sinh" });
    expect(applyFilterPatch(f, { errorCode: "L04" }, ctx)).toEqual({ ...base, category: "Vệ sinh", errorCode: "L04" });
    expect(applyFilterPatch(f, { category: undefined }, ctx)).toEqual({ ...base, errorCode: "L01" });
  });

  it("treats a spread of the current filters like a minimal patch", () => {
    const f: GlobalFilters = { ...base, grade: 6, classCode: "6A01", category: "Chuyên cần", errorCode: "L01" };
    expect(applyFilterPatch(f, { ...f, grade: 7 }, ctx)).toEqual({ ...base, grade: 7, category: "Chuyên cần", errorCode: "L01" });
    expect(applyFilterPatch(f, { ...f, category: "Vệ sinh" }, ctx)).toEqual({ ...base, grade: 6, classCode: "6A01", category: "Vệ sinh" });
    expect(applyFilterPatch(f, { ...f }, ctx)).toEqual(f);
    expect(applyFilterPatch(f, { ...f, classCode: "  " }, ctx)).toEqual({ ...base, grade: 6, category: "Chuyên cần", errorCode: "L01" });
  });

  it("does not mutate the input", () => {
    const f = { ...base, grade: 6 };
    applyFilterPatch(f, { grade: 7 }, ctx);
    expect(f.grade).toBe(6);
  });
});

describe("resetPatch", () => {
  it("clears every filter and keeps the period mode", () => {
    const f: GlobalFilters = { period: { mode: "month", key: "2026-09" }, grade: 6, classCode: "6A01", category: "Vệ sinh", errorCode: "L04" };
    expect(applyFilterPatch(f, resetPatch(f), ctx)).toEqual({ period: { mode: "month", key: "2026-10" } });
  });
});

describe("writeFilterParams / stripLevelScopedParams", () => {
  it("writes filters, removes cleared ones and preserves unrelated params", () => {
    const base = new URLSearchParams("tab=chi-tiet&grade=7&err=L01&mode=week&key=2026-10-12");
    const out = writeFilterParams(base, { period: { mode: "month", key: "2026-10" }, grade: 6, classCode: "6A01" }, true);
    expect(Object.fromEntries(out)).toEqual({ tab: "chi-tiet", grade: "6", class: "6A01", mode: "month", key: "2026-10" });
    expect(base.get("grade")).toBe("7"); // input untouched
  });

  it("leaves the period params alone unless asked", () => {
    const out = writeFilterParams(new URLSearchParams(""), { period: { mode: "week", key: "2026-10-19" }, category: "Vệ sinh" }, false);
    expect(Object.fromEntries(out)).toEqual({ cat: "Vệ sinh" });
    const all = writeFilterParams(new URLSearchParams("key=2026-10"), { period: { mode: "all" } }, true);
    expect(Object.fromEntries(all)).toEqual({ mode: "all" });
  });

  it("strips grade/class/err on level change", () => {
    expect(stripLevelScopedParams(new URLSearchParams("mode=all&cat=X"))).toBeUndefined();
    const out = stripLevelScopedParams(new URLSearchParams("mode=all&grade=6&class=6A01&cat=X&err=L01"));
    expect(out?.toString()).toBe("mode=all&cat=X");
  });
});

describe("buildFilterOptions", () => {
  it("builds grades, natural-sorted active classes, categories and errors", () => {
    const o = buildFilterOptions({ levelId: "THCS", dataset: { classes, catalog }, periods });
    expect(o.grades).toEqual([6, 7, 8, 9].map((g) => ({ value: g, label: `Khối ${g}` })));
    expect(o.classes.map((c) => c.code)).toEqual(["6A01", "6A2", "6A10", "7A01"]);
    expect(o.categories).toEqual(["Chuyên cần", "Vệ sinh"]);
    expect(o.errors.map((e) => e.code)).toEqual(["L01", "L04", "L05"]);
    expect(o.weeks.length).toBe(weeks.length);
    expect(o.months[0]).toMatchObject({ mode: "month", key: "2026-08" });
    expect(o.semesters.map((s) => s.key)).toEqual(["HK1", "HK2"]);
  });

  it("filters classes by grade and errors by category", () => {
    const o = buildFilterOptions({ levelId: "THCS", dataset: { classes, catalog }, periods, grade: 7, category: "Chuyên cần" });
    expect(o.classes.map((c) => c.code)).toEqual(["7A01"]);
    expect(o.errors.map((e) => e.code)).toEqual(["L01", "L05"]);
  });

  it("returns empty lists while loading", () => {
    const o = buildFilterOptions({ levelId: "TH" });
    expect(o.grades.map((g) => g.value)).toEqual([1, 2, 3, 4, 5]);
    expect(o).toMatchObject({ classes: [], categories: [], errors: [], weeks: [], months: [], semesters: [] });
  });
});

describe("activeFilterCount", () => {
  it("counts non-period filters", () => {
    expect(activeFilterCount({ period: { mode: "all" } })).toBe(0);
    expect(activeFilterCount({ period: { mode: "all" }, grade: 6, errorCode: "L01" })).toBe(2);
  });
});
