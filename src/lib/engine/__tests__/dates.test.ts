import { describe, expect, it } from "vitest";
import { defaultLevelConfig } from "../../constants";
import {
  addDays,
  diffDays,
  formatDateVN,
  formatMonthLabel,
  formatWeekLabel,
  generateWeeks,
  isIsoDate,
  mondayOf,
  parseLooseDate,
  todayVN,
  weekInfo,
  weekdayLabelVN,
} from "../dates";

describe("dates helpers", () => {
  it("mondayOf maps Sunday to the Monday before it (ISO week)", () => {
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(mondayOf("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(mondayOf("2026-10-21")).toBe("2026-10-19"); // Wednesday
    expect(mondayOf("2027-01-03")).toBe("2026-12-28"); // Sunday across a year boundary
    expect(weekdayLabelVN("2026-10-25")).toBe("Chủ nhật");
    expect(weekdayLabelVN("2026-10-19")).toBe("Thứ Hai");
  });

  it("formatWeekLabel / formatMonthLabel / formatDateVN", () => {
    expect(formatWeekLabel("2026-10-12")).toBe("12/10 – 18/10/2026");
    expect(formatWeekLabel("2026-12-28")).toBe("28/12 – 03/01/2027");
    expect(formatMonthLabel("2026-09")).toBe("Tháng 9/2026");
    expect(formatDateVN("2026-10-21")).toBe("21/10/2026");
    expect(formatDateVN("")).toBe("");
  });

  it("todayVN uses UTC+7", () => {
    expect(todayVN(new Date("2026-10-20T18:00:00Z"))).toBe("2026-10-21");
    expect(todayVN(new Date("2026-10-20T16:59:00Z"))).toBe("2026-10-20");
  });

  it("date arithmetic and parsing", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-10-19", "2026-10-05")).toBe(14);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(parseLooseDate("5/9/2026")).toBe("2026-09-05");
    expect(parseLooseDate("2026-09-05T10:00:00Z")).toBe("2026-09-05");
    expect(parseLooseDate("31/02/2026")).toBe("");
  });

  it("generateWeeks covers Mondays from firstWeek to the last semester end", () => {
    const cfg = defaultLevelConfig("THCS");
    const weeks = generateWeeks(cfg.firstWeek, cfg.semesters);
    expect(weeks[0]).toEqual({ weekStart: "2026-08-17", month: "2026-08", semester: "HK1", counted: true });
    expect(weeks.every((w) => mondayOf(w.weekStart) === w.weekStart)).toBe(true);
    expect(weeks[weeks.length - 1].weekStart <= "2027-05-31").toBe(true);
    expect(weeks.find((w) => w.weekStart === "2026-12-28")?.semester).toBe("HK1");
    expect(weeks.find((w) => w.weekStart === "2027-01-04")?.semester).toBe("HK2");
  });

  it("weekInfo prefers the configured calendar row", () => {
    const cfg = defaultLevelConfig("THCS");
    const weeks = [{ weekStart: "2026-09-28", month: "2026-10", semester: "HK1", counted: true }];
    expect(weekInfo("2026-10-01", weeks, cfg.semesters)).toEqual({ week: "2026-09-28", month: "2026-10", semester: "HK1" });
    expect(weekInfo("2026-09-30", [], cfg.semesters)).toEqual({ week: "2026-09-28", month: "2026-09", semester: "HK1" });
  });
});
