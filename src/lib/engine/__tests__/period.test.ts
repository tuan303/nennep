import { describe, expect, it } from "vitest";
import { FIXTURE_HOLIDAY_WEEK, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import {
  contextPeriod,
  countedWeeks,
  defaultPeriod,
  elapsedWeeksInPeriod,
  isAllPeriod,
  isRecordInPeriod,
  isWeekInPeriod,
  periodLabel,
  periodMatcher,
  periodOptions,
  previousPeriod,
  weeksInPeriod,
} from "../period";

const ds = makeFixtureDataset();
const { weeks } = ds;
const sems = ds.config.semesters;

describe("countedWeeks (BR-RANK-02/03)", () => {
  it("current month only counts elapsed weeks", () => {
    // October weeks: 05, 12, 19, 26 – today is Wednesday 2026-10-21
    expect(weeksInPeriod({ mode: "month", key: "2026-10" }, weeks).map((w) => w.weekStart)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(countedWeeks({ mode: "month", key: "2026-10" }, weeks, FIXTURE_TODAY)).toBe(3);
    expect(countedWeeks({ mode: "month", key: "2026-10" }, weeks, "2026-10-31")).toBe(4);
    expect(countedWeeks({ mode: "month", key: "2026-10" }, weeks, "2026-10-04")).toBe(0);
  });

  it("holiday (non-counted) weeks are excluded", () => {
    expect(weeks.find((w) => w.weekStart === FIXTURE_HOLIDAY_WEEK)?.counted).toBe(false);
    expect(countedWeeks({ mode: "month", key: "2026-08" }, weeks, FIXTURE_TODAY)).toBe(2); // 17, 24 (31 is a holiday)
    expect(countedWeeks({ mode: "week", key: FIXTURE_HOLIDAY_WEEK }, weeks, FIXTURE_TODAY)).toBe(0);
    // HK1 elapsed: 10 weeks from 2026-08-17 to 2026-10-19, minus the holiday
    expect(countedWeeks({ mode: "semester", key: "HK1" }, weeks, FIXTURE_TODAY)).toBe(9);
    expect(countedWeeks({ mode: "all" }, weeks, FIXTURE_TODAY)).toBe(9);
  });

  it("week mode: 1 for the current/past counted week, 0 for a future week", () => {
    expect(countedWeeks({ mode: "week", key: "2026-10-19" }, weeks, FIXTURE_TODAY)).toBe(1);
    expect(countedWeeks({ mode: "week", key: "2026-10-12" }, weeks, FIXTURE_TODAY)).toBe(1);
    expect(countedWeeks({ mode: "week", key: "2026-10-26" }, weeks, FIXTURE_TODAY)).toBe(0);
    expect(countedWeeks({ mode: "week", key: "2030-01-07" }, weeks, FIXTURE_TODAY)).toBe(0);
    expect(countedWeeks({ mode: "semester", key: "HK2" }, weeks, FIXTURE_TODAY)).toBe(0);
  });

  it("elapsedWeeksInPeriod keeps non-counted weeks", () => {
    expect(elapsedWeeksInPeriod({ mode: "month", key: "2026-08" }, weeks, FIXTURE_TODAY)).toHaveLength(3);
  });
});

describe("period membership", () => {
  it("isWeekInPeriod", () => {
    expect(isWeekInPeriod("2026-10-12", { mode: "month", key: "2026-10" }, weeks)).toBe(true);
    expect(isWeekInPeriod("2026-09-28", { mode: "month", key: "2026-10" }, weeks)).toBe(false); // Monday in September
    expect(isWeekInPeriod("2026-10-12", { mode: "semester", key: "HK1" }, weeks)).toBe(true);
    expect(isWeekInPeriod("2026-10-12", { mode: "week", key: "2026-10-12" }, weeks)).toBe(true);
    expect(isWeekInPeriod("2026-10-12", { mode: "all" }, weeks)).toBe(true);
    expect(isWeekInPeriod("2027-07-05", { mode: "month", key: "2027-07" }, weeks)).toBe(true); // not in calendar → month of Monday
  });

  it("uses the calendar row (admin may move a week to another month) and falls back to record fields", () => {
    const moved = weeks.map((w) => (w.weekStart === "2026-09-28" ? { ...w, month: "2026-10" } : w));
    const rec = { week: "2026-09-28", month: "2026-09", semester: "HK1" };
    expect(isRecordInPeriod(rec, { mode: "month", key: "2026-10" }, moved)).toBe(true);
    expect(isRecordInPeriod(rec, { mode: "month", key: "2026-10" }, weeks)).toBe(false);
    const outside = { week: "2027-07-05", month: "2027-07", semester: "" };
    const inJuly = periodMatcher({ mode: "month", key: "2027-07" }, weeks);
    expect(inJuly(outside)).toBe(true);
    // Outside the calendar → in no semester, even when the record carries the code (e.g. last school year's HK2).
    expect(isRecordInPeriod({ week: "2027-07-05", month: "2027-07", semester: "HK2" }, { mode: "semester", key: "HK2" }, weeks)).toBe(false);
    expect(isWeekInPeriod("2027-07-05", { mode: "semester", key: "HK2" }, weeks)).toBe(false);
  });

  it("a period without key behaves as 'all'", () => {
    expect(periodMatcher({ mode: "week" }, weeks)({ week: "2026-10-12", month: "2026-10", semester: "HK1" })).toBe(true);
    expect(periodLabel({ mode: "month" }, sems)).toBe("Toàn bộ năm học");
  });
});

describe("defaultPeriod / previousPeriod / periodLabel", () => {
  it("defaultPeriod: current week, else last past week, else all", () => {
    expect(defaultPeriod(weeks, FIXTURE_TODAY)).toEqual({ mode: "week", key: "2026-10-19" });
    expect(defaultPeriod(weeks, "2027-07-01")).toEqual({ mode: "week", key: weeks[weeks.length - 1].weekStart });
    expect(defaultPeriod(weeks, "2026-08-01")).toEqual({ mode: "all" });
  });

  it("previousPeriod", () => {
    expect(previousPeriod({ mode: "week", key: "2026-10-19" }, weeks, sems)).toEqual({ mode: "week", key: "2026-10-12" });
    expect(previousPeriod({ mode: "week", key: "2026-08-17" }, weeks, sems)).toBeUndefined();
    expect(previousPeriod({ mode: "month", key: "2026-10" }, weeks, sems)).toEqual({ mode: "month", key: "2026-09" });
    expect(previousPeriod({ mode: "month", key: "2026-08" }, weeks, sems)).toBeUndefined();
    expect(previousPeriod({ mode: "semester", key: "HK2" }, weeks, sems)).toEqual({ mode: "semester", key: "HK1" });
    expect(previousPeriod({ mode: "semester", key: "HK1" }, weeks, sems)).toBeUndefined();
    expect(previousPeriod({ mode: "all" }, weeks, sems)).toBeUndefined();
  });

  it("periodLabel", () => {
    expect(periodLabel({ mode: "week", key: "2026-10-12" }, sems)).toBe("Tuần 12/10 – 18/10/2026");
    expect(periodLabel({ mode: "month", key: "2026-10" }, sems)).toBe("Tháng 10/2026");
    expect(periodLabel({ mode: "semester", key: "HK1" }, sems)).toBe("Học kỳ I");
    expect(periodLabel({ mode: "all" }, sems)).toBe("Toàn bộ năm học");
  });

  it("periodOptions flags current / future and labels holiday weeks", () => {
    const opts = periodOptions(weeks, sems, FIXTURE_TODAY);
    expect(opts.weeks).toHaveLength(weeks.length);
    const current = opts.weeks.filter((w) => w.isCurrent);
    expect(current.map((w) => w.key)).toEqual(["2026-10-19"]);
    expect(opts.weeks.find((w) => w.key === "2026-10-26")?.isFuture).toBe(true);
    expect(opts.weeks.find((w) => w.key === "2026-10-12")?.isFuture).toBe(false);
    expect(opts.weeks.find((w) => w.key === FIXTURE_HOLIDAY_WEEK)?.label).toBe("Tuần 31/08 – 06/09/2026 (không tính thi đua)");
    expect(opts.months[0]).toMatchObject({ mode: "month", key: "2026-08", label: "Tháng 8/2026", isFuture: false, isCurrent: false });
    expect(opts.months.find((m) => m.key === "2026-10")).toMatchObject({ isCurrent: true, isFuture: false });
    expect(opts.months.find((m) => m.key === "2026-11")?.isFuture).toBe(true);
    expect(opts.semesters).toEqual([
      { mode: "semester", key: "HK1", label: "Học kỳ I", isFuture: false, isCurrent: true },
      { mode: "semester", key: "HK2", label: "Học kỳ II", isFuture: true, isCurrent: false },
    ]);
  });
});

describe("contextPeriod / isAllPeriod", () => {
  it("widens a week to its semester (or the whole year outside every semester); other periods are unchanged", () => {
    expect(contextPeriod({ mode: "week", key: "2026-10-19" }, weeks)).toEqual({ period: { mode: "semester", key: "HK1" }, widened: true });
    expect(contextPeriod({ mode: "week", key: "2027-01-04" }, weeks)).toEqual({ period: { mode: "semester", key: "HK2" }, widened: true });
    expect(contextPeriod({ mode: "week", key: "2030-01-07" }, weeks)).toEqual({ period: { mode: "all" }, widened: true });
    const month = { mode: "month" as const, key: "2026-10" };
    expect(contextPeriod(month, weeks)).toEqual({ period: month, widened: false });
    expect(contextPeriod({ mode: "all" }, weeks)).toEqual({ period: { mode: "all" }, widened: false });
    expect(contextPeriod({ mode: "week" }, weeks).widened).toBe(false);
  });

  it("a period without a key counts as 'all'", () => {
    expect(isAllPeriod({ mode: "all" })).toBe(true);
    expect(isAllPeriod({ mode: "semester" })).toBe(true);
    expect(isAllPeriod({ mode: "week", key: "2026-10-19" })).toBe(false);
  });
});
