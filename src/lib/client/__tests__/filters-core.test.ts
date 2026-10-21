import { describe, expect, it } from "vitest";
import { defaultLevelConfig } from "@/lib/constants";
import { generateWeeks } from "@/lib/engine/dates";
import { defaultPeriod, periodOptions } from "@/lib/engine/period";
import type { CatalogItem, ClassInfo, GlobalFilters, StudentLite } from "@/lib/types";
import {
  activeFilterCount,
  applyFilterPatch,
  buildFilterOptions,
  catalogGroups,
  defaultKeyForMode,
  readFilterParams,
  resetPatch,
  resolveFilters,
  stripLevelScopedParams,
  studentFilterOptions,
  writeFilterParams,
  type FilterContext,
} from "../filters-core";

const TODAY = "2026-10-21"; // Wednesday → current week 2026-10-19, month 2026-10, HK1
const config = defaultLevelConfig("THCS");
const weeks = generateWeeks(config.firstWeek, config.semesters);
const periods = periodOptions(weeks, config.semesters, TODAY);

const cls = (code: string, grade: number, active = true): ClassInfo => ({ code, levelId: "THCS", grade, active, order: 0 });
const err = (code: string, category: string, group?: string): CatalogItem => ({
  code,
  category,
  issue: `Lỗi ${code}`,
  ...(group ? { group } : {}),
  penalty: 2,
  unit: "/HS",
  is5S: false,
  active: true,
});
// Fictional students (no real data).
const stu = (id: string, name: string, classCode: string, status: StudentLite["status"] = "ACTIVE"): StudentLite => ({
  id,
  name,
  classCode,
  grade: Number(classCode.slice(0, 1)),
  status,
});

const classes = [cls("6A10", 6), cls("7A01", 7), cls("6A2", 6), cls("6A01", 6), cls("6A03", 6, false)];
const catalog = [err("L01", "Chuyên cần", "Nhóm 1"), err("L04", "Vệ sinh", "Nhóm 2"), err("L05", "Chuyên cần", "Nhóm 10"), err("L06", "Vệ sinh")];
const students = [
  stu("HS0003", "Trần Thị Bình", "7A01"),
  stu("HS0001", "Nguyễn Văn An", "6A01"),
  stu("HS0002", "Lê Văn Cường", "6A10"),
  stu("HS0004", "Phạm Thị An", "6A01", "TRANSFERRED_OUT"),
];

const ctx: FilterContext = {
  levelId: "THCS",
  dataset: { classes, catalog, students },
  periods,
  defaultPeriod: defaultPeriod(weeks, TODAY),
};
const loadingCtx: FilterContext = { levelId: "THCS", defaultPeriod: { mode: "all" } };
const params = (qs: string) => readFilterParams(new URLSearchParams(qs));

describe("readFilterParams", () => {
  it("reads and trims the documented params", () => {
    expect(params("mode=week&key=2026-10-12&grade=6&class=%206A01%20&cat=V%E1%BB%87%20sinh&err=L04&group=Nh%C3%B3m%202&student=HS0001&x=1")).toEqual({
      mode: "week",
      key: "2026-10-12",
      grade: "6",
      classCode: "6A01",
      category: "Vệ sinh",
      errorCode: "L04",
      group: "Nhóm 2",
      studentId: "HS0001",
    });
    expect(params("class=&grade=")).toEqual({
      mode: undefined,
      key: undefined,
      grade: undefined,
      classCode: undefined,
      category: undefined,
      errorCode: undefined,
      group: undefined,
      studentId: undefined,
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

  it("validates the group and the Mã HS against the dataset", () => {
    expect(resolveFilters(params("group=Nhóm 2&student=HS0001"), ctx)).toEqual({ period: ctx.defaultPeriod, group: "Nhóm 2", studentId: "HS0001" });
    expect(resolveFilters(params("group=Nhóm 9"), ctx).group).toBeUndefined();
    // GVCN datasets only hold own-class students: another class's Mã HS is unknown → ignored.
    expect(resolveFilters(params("student=HS9999"), ctx).studentId).toBeUndefined();
    expect(resolveFilters(params("group=Nhóm 2&err=L01"), ctx)).toEqual({ period: ctx.defaultPeriod, group: "Nhóm 2" });
    expect(resolveFilters(params("group=Nhóm 1&err=L01"), ctx)).toEqual({ period: ctx.defaultPeriod, group: "Nhóm 1", errorCode: "L01" });
  });

  it("ignores a Mã HS outside the grade / class of the URL (like applyFilterPatch)", () => {
    // e.g. an "open class" drill-down that only swaps `class` while a student of another class was filtered.
    expect(resolveFilters(params("class=6A10&student=HS0001"), ctx)).toEqual({ period: ctx.defaultPeriod, classCode: "6A10" });
    expect(resolveFilters(params("grade=7&student=HS0001"), ctx)).toEqual({ period: ctx.defaultPeriod, grade: 7 });
    expect(resolveFilters(params("grade=6&class=6A01&student=HS0001"), ctx)).toEqual({ period: ctx.defaultPeriod, grade: 6, classCode: "6A01", studentId: "HS0001" });
  });

  it("replaces an unknown period key by the default key of that mode", () => {
    expect(resolveFilters(params("mode=month&key=2031-01"), ctx).period).toEqual({ mode: "month", key: "2026-10" });
    expect(resolveFilters(params("mode=semester"), ctx).period).toEqual({ mode: "semester", key: "HK1" });
    expect(resolveFilters(params("mode=bogus&key=1"), ctx).period).toEqual(ctx.defaultPeriod);
  });

  it("only checks the syntax while the dataset is loading", () => {
    expect(resolveFilters(params("mode=week&key=2026-10-12&class=6A01&err=L99&group=X&student=HS9"), loadingCtx)).toEqual({
      period: { mode: "week", key: "2026-10-12" },
      classCode: "6A01",
      errorCode: "L99",
      group: "X",
      studentId: "HS9",
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

  it("keeps group and error consistent", () => {
    const f = { ...base, group: "Nhóm 1", errorCode: "L01" };
    expect(applyFilterPatch(f, { group: "Nhóm 2" }, ctx)).toEqual({ ...base, group: "Nhóm 2" });
    expect(applyFilterPatch(f, { group: undefined }, ctx)).toEqual({ ...base, errorCode: "L01" });
    // A chosen error drags the group along only when a group is set.
    expect(applyFilterPatch(f, { errorCode: "L04" }, ctx)).toEqual({ ...base, group: "Nhóm 2", errorCode: "L04" });
    expect(applyFilterPatch(base, { errorCode: "L04" }, ctx)).toEqual({ ...base, errorCode: "L04" });
    // An error without a group clears the group filter.
    expect(applyFilterPatch(f, { errorCode: "L06" }, ctx)).toEqual({ ...base, errorCode: "L06" });
    // Group + error in one patch: the error must belong to the group.
    expect(applyFilterPatch(base, { group: "Nhóm 10", errorCode: "L05" }, ctx)).toEqual({ ...base, group: "Nhóm 10", errorCode: "L05" });
    expect(applyFilterPatch(base, { group: "Nhóm 10", errorCode: "L04" }, ctx)).toEqual({ ...base, group: "Nhóm 2", errorCode: "L04" });
  });

  it("clears the student when the grade / class scope no longer contains them", () => {
    const f = { ...base, studentId: "HS0001" }; // 6A01
    expect(applyFilterPatch(f, { grade: 7 }, ctx)).toEqual({ ...base, grade: 7 });
    expect(applyFilterPatch(f, { grade: 6 }, ctx)).toEqual({ ...f, grade: 6 });
    expect(applyFilterPatch(f, { classCode: "6A10" }, ctx)).toEqual({ ...base, classCode: "6A10" });
    expect(applyFilterPatch(f, { classCode: "6A01" }, ctx)).toEqual({ ...f, classCode: "6A01" });
    expect(applyFilterPatch({ ...f, classCode: "6A01" }, { classCode: undefined }, ctx)).toEqual(f);
    // Other changes never touch the student.
    expect(applyFilterPatch({ ...f, grade: 7 }, { category: "Vệ sinh" }, ctx)).toEqual({ ...f, grade: 7, category: "Vệ sinh" });
    expect(applyFilterPatch(f, { studentId: "" }, ctx)).toEqual(base);
    expect(applyFilterPatch(base, { studentId: "HS0003", group: "Nhóm 1" }, ctx)).toEqual({ ...base, studentId: "HS0003", group: "Nhóm 1" });
  });

  it("treats a spread of the current filters like a minimal patch", () => {
    const f: GlobalFilters = { ...base, grade: 6, classCode: "6A01", category: "Chuyên cần", errorCode: "L01" };
    expect(applyFilterPatch(f, { ...f, grade: 7 }, ctx)).toEqual({ ...base, grade: 7, category: "Chuyên cần", errorCode: "L01" });
    expect(applyFilterPatch(f, { ...f, category: "Vệ sinh" }, ctx)).toEqual({ ...base, grade: 6, classCode: "6A01", category: "Vệ sinh" });
    expect(applyFilterPatch(f, { ...f }, ctx)).toEqual(f);
    expect(applyFilterPatch(f, { ...f, classCode: "  " }, ctx)).toEqual({ ...base, grade: 6, category: "Chuyên cần", errorCode: "L01" });
    const g: GlobalFilters = { ...base, group: "Nhóm 1", errorCode: "L01", studentId: "HS0001" };
    expect(applyFilterPatch(g, { ...g }, ctx)).toEqual(g);
    expect(applyFilterPatch(g, { ...g, grade: 6 }, ctx)).toEqual({ ...g, grade: 6 });
  });

  it("does not mutate the input", () => {
    const f = { ...base, grade: 6 };
    applyFilterPatch(f, { grade: 7 }, ctx);
    expect(f.grade).toBe(6);
  });
});

describe("resetPatch", () => {
  it("clears every filter and keeps the period mode", () => {
    const f: GlobalFilters = {
      period: { mode: "month", key: "2026-09" },
      grade: 6,
      classCode: "6A01",
      category: "Vệ sinh",
      errorCode: "L04",
      group: "Nhóm 2",
      studentId: "HS0001",
    };
    expect(applyFilterPatch(f, resetPatch(f), ctx)).toEqual({ period: { mode: "month", key: "2026-10" } });
  });
});

describe("writeFilterParams / stripLevelScopedParams", () => {
  it("writes filters, removes cleared ones and preserves unrelated params", () => {
    const base = new URLSearchParams("tab=chi-tiet&grade=7&err=L01&mode=week&key=2026-10-12");
    const out = writeFilterParams(
      base,
      { period: { mode: "month", key: "2026-10" }, grade: 6, classCode: "6A01", group: "Nhóm 1", studentId: "HS0001" },
      true,
    );
    expect(Object.fromEntries(out)).toEqual({
      tab: "chi-tiet",
      grade: "6",
      class: "6A01",
      group: "Nhóm 1",
      student: "HS0001",
      mode: "month",
      key: "2026-10",
    });
    // Round trip URL → filters.
    expect(resolveFilters(readFilterParams(out), ctx)).toEqual({
      period: { mode: "month", key: "2026-10" },
      grade: 6,
      classCode: "6A01",
      group: "Nhóm 1",
      studentId: "HS0001",
    });
    expect(base.get("grade")).toBe("7"); // input untouched
  });

  it("leaves the period params alone unless asked", () => {
    const out = writeFilterParams(new URLSearchParams(""), { period: { mode: "week", key: "2026-10-19" }, category: "Vệ sinh" }, false);
    expect(Object.fromEntries(out)).toEqual({ cat: "Vệ sinh" });
    const all = writeFilterParams(new URLSearchParams("key=2026-10"), { period: { mode: "all" } }, true);
    expect(Object.fromEntries(all)).toEqual({ mode: "all" });
  });

  it("strips grade/class/err/group/student on level change", () => {
    expect(stripLevelScopedParams(new URLSearchParams("mode=all&cat=X"))).toBeUndefined();
    const out = stripLevelScopedParams(new URLSearchParams("mode=all&grade=6&class=6A01&cat=X&err=L01"));
    expect(out?.toString()).toBe("mode=all&cat=X");
    expect(stripLevelScopedParams(new URLSearchParams("group=Nh%C3%B3m+1&student=HS0001&tab=a"))?.toString()).toBe("tab=a");
  });
});

describe("buildFilterOptions", () => {
  it("builds grades, natural-sorted active classes, categories and errors", () => {
    const o = buildFilterOptions({ levelId: "THCS", dataset: { classes, catalog, students }, periods });
    expect(o.grades).toEqual([6, 7, 8, 9].map((g) => ({ value: g, label: `Khối ${g}` })));
    expect(o.classes.map((c) => c.code)).toEqual(["6A01", "6A2", "6A10", "7A01"]);
    expect(o.categories).toEqual(["Chuyên cần", "Vệ sinh"]);
    expect(o.errors.map((e) => e.code)).toEqual(["L01", "L04", "L05", "L06"]);
    expect(o.groups).toEqual(["Nhóm 1", "Nhóm 2", "Nhóm 10"]);
    // Class order (grade, natural code), then given name, then full name; every status is listed (history).
    expect(o.students.map((s) => s.id)).toEqual(["HS0001", "HS0004", "HS0002", "HS0003"]);
    expect(o.students[1]).toEqual({ id: "HS0004", name: "Phạm Thị An", classCode: "6A01", grade: 6, status: "TRANSFERRED_OUT" });
    expect(o.weeks.length).toBe(weeks.length);
    expect(o.months[0]).toMatchObject({ mode: "month", key: "2026-08" });
    expect(o.semesters.map((s) => s.key)).toEqual(["HK1", "HK2"]);
  });

  it("filters classes by grade and errors by category", () => {
    const o = buildFilterOptions({ levelId: "THCS", dataset: { classes, catalog, students }, periods, grade: 7, category: "Chuyên cần" });
    expect(o.classes.map((c) => c.code)).toEqual(["7A01"]);
    expect(o.errors.map((e) => e.code)).toEqual(["L01", "L05"]);
    expect(o.students.map((s) => s.id)).toEqual(["HS0003"]);
    expect(buildFilterOptions({ levelId: "THCS", dataset: { classes, catalog, students }, classCode: "6A10" }).students.map((s) => s.id)).toEqual(["HS0002"]);
  });

  it("offers only the errors of the selected group (and Mảng)", () => {
    expect(buildFilterOptions({ levelId: "THCS", dataset: { classes, catalog, students }, group: "Nhóm 2" }).errors.map((e) => e.code)).toEqual(["L04"]);
    expect(buildFilterOptions({ levelId: "THCS", dataset: { classes, catalog, students }, group: "Nhóm 1", category: "Vệ sinh" }).errors).toEqual([]);
  });

  it("lists distinct catalog groups and scoped students", () => {
    expect(catalogGroups([{ group: " Nhóm 3 " }, { group: "" }, {}, { group: "Nhóm 3" }, { group: "Nhóm 1" }])).toEqual(["Nhóm 1", "Nhóm 3"]);
    expect(studentFilterOptions(students, classes, { grade: 6 }).map((s) => s.classCode)).toEqual(["6A01", "6A01", "6A10"]);
  });

  it("returns empty lists while loading", () => {
    const o = buildFilterOptions({ levelId: "TH" });
    expect(o.grades.map((g) => g.value)).toEqual([1, 2, 3, 4, 5]);
    expect(o).toMatchObject({ classes: [], categories: [], errors: [], groups: [], students: [], weeks: [], months: [], semesters: [] });
  });
});

describe("activeFilterCount", () => {
  it("counts non-period filters", () => {
    expect(activeFilterCount({ period: { mode: "all" } })).toBe(0);
    expect(activeFilterCount({ period: { mode: "all" }, grade: 6, errorCode: "L01" })).toBe(2);
    expect(activeFilterCount({ period: { mode: "all" }, group: "Nhóm 1", studentId: "HS0001" })).toBe(2);
  });
});
