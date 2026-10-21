import { describe, expect, it } from "vitest";
import { periodOptions } from "@/lib/engine/period";
import { generateWeeks } from "@/lib/engine/dates";
import { defaultLevelConfig } from "@/lib/constants";
import { periodChoices, periodText, stepPeriodKey } from "../period-utils";

const config = defaultLevelConfig("THCS");
const weeks = generateWeeks(config.firstWeek, config.semesters);
const TODAY = "2026-10-21"; // Wednesday; week of Monday 2026-10-19
const lists = periodOptions(weeks, config.semesters, TODAY);

describe("periodChoices", () => {
  it("lists past and current weeks newest first, grouped by month, without future weeks", () => {
    const rows = periodChoices(lists, "week");
    expect(rows[0]).toMatchObject({ value: "2026-10-19", isCurrent: true, description: "Tuần hiện tại", group: "Tháng 10/2026" });
    expect(rows[1].value).toBe("2026-10-12");
    expect(rows.at(-1)?.value).toBe("2026-08-17");
    expect(rows.some((r) => r.value > "2026-10-19")).toBe(false);
  });

  it("keeps a selected future week visible", () => {
    const rows = periodChoices(lists, "week", "2026-11-02");
    expect(rows[0]).toMatchObject({ value: "2026-11-02", description: "Chưa diễn ra" });
  });

  it("months newest first; semesters in calendar order with status hints", () => {
    expect(periodChoices(lists, "month").map((r) => r.value)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(periodChoices(lists, "semester").map((r) => [r.value, r.description])).toEqual([
      ["HK1", "Học kỳ hiện tại"],
      ["HK2", "Chưa bắt đầu"],
    ]);
    expect(periodChoices(lists, "all")).toEqual([]);
  });
});

describe("stepPeriodKey", () => {
  it("steps to adjacent periods but never into the future", () => {
    expect(stepPeriodKey(lists.weeks, "2026-10-12", 1)).toBe("2026-10-19");
    expect(stepPeriodKey(lists.weeks, "2026-10-19", 1)).toBeUndefined();
    expect(stepPeriodKey(lists.weeks, "2026-10-19", -1)).toBe("2026-10-12");
    expect(stepPeriodKey(lists.weeks, "2026-08-17", -1)).toBeUndefined();
    expect(stepPeriodKey(lists.semesters, "HK1", 1)).toBeUndefined();
    expect(stepPeriodKey(lists.weeks, undefined, -1)).toBeUndefined();
  });
});

describe("periodText", () => {
  it("uses option labels and falls back to formatting the key", () => {
    expect(periodText({ mode: "all" }, lists)).toBe("Toàn bộ năm học");
    expect(periodText({ mode: "week", key: "2026-10-12" }, lists)).toBe("Tuần 12/10 – 18/10/2026");
    expect(periodText({ mode: "month", key: "2026-10" }, lists)).toBe("Tháng 10/2026");
    expect(periodText({ mode: "semester", key: "HK1" }, lists)).toBe("Học kỳ I");
    const empty = { weeks: [], months: [], semesters: [] };
    expect(periodText({ mode: "week", key: "2026-10-12" }, empty)).toBe("Tuần 12/10 – 18/10/2026");
    expect(periodText({ mode: "month", key: "2026-09" }, empty)).toBe("Tháng 9/2026");
  });
});
