import { describe, expect, it } from "vitest";
import {
  EMPTY_VALUE,
  MINUS_SIGN,
  fmtCount,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtPercent,
  fmtPoints,
  fmtRelative,
  fmtTime,
  fmtTopLabel,
} from "../format";

describe("fmtNumber", () => {
  it("uses vi-VN grouping and decimal comma", () => {
    expect(fmtNumber(12345.678)).toBe("12.345,68");
    expect(fmtNumber(1234)).toBe("1.234");
    expect(fmtNumber(2.5)).toBe("2,5");
    expect(fmtNumber(12345.678, 0)).toBe("12.346");
  });
  it("uses the typographic minus and normalises -0", () => {
    expect(fmtNumber(-5)).toBe(`${MINUS_SIGN}5`);
    expect(fmtNumber(-1234.5)).toBe("−1.234,5");
    expect(fmtNumber(-0)).toBe("0");
    expect(fmtNumber(-0.001)).toBe("0");
  });
  it("renders missing values as a dash", () => {
    expect(fmtNumber(undefined)).toBe(EMPTY_VALUE);
    expect(fmtNumber(null)).toBe(EMPTY_VALUE);
    expect(fmtNumber(Number.NaN)).toBe(EMPTY_VALUE);
    expect(fmtNumber(Number.POSITIVE_INFINITY)).toBe(EMPTY_VALUE);
  });
});

describe("fmtPoints", () => {
  it("is always signed except zero", () => {
    expect(fmtPoints(10)).toBe("+10");
    expect(fmtPoints(-25)).toBe("−25");
    expect(fmtPoints(-25)).toBe(`${MINUS_SIGN}25`);
    expect(fmtPoints(0)).toBe("0");
    expect(fmtPoints(-0.001)).toBe("0");
    expect(fmtPoints(2.5)).toBe("+2,5");
    expect(fmtPoints(1234)).toBe("+1.234");
    expect(fmtPoints(1.005)).toBe("+1"); // 2-decimal rounding of binary 1.005 → 1
  });
  it("handles missing values", () => {
    expect(fmtPoints(undefined)).toBe(EMPTY_VALUE);
    expect(fmtPoints(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe("fmtPercent", () => {
  it("formats ratios as whole percents by default", () => {
    expect(fmtPercent(0.873)).toBe("87%");
    expect(fmtPercent(1)).toBe("100%");
    expect(fmtPercent(0)).toBe("0%");
    expect(fmtPercent(0.995)).toBe("100%");
  });
  it("supports decimals with a decimal comma", () => {
    expect(fmtPercent(0.8734, 1)).toBe("87,3%");
    expect(fmtPercent(0.5, 1)).toBe("50%");
  });
  it("handles negatives and missing values", () => {
    expect(fmtPercent(-0.12)).toBe("−12%");
    expect(fmtPercent(undefined)).toBe(EMPTY_VALUE);
  });
});

describe("fmtCount", () => {
  it("has no plural forms", () => {
    expect(fmtCount(1, "học sinh")).toBe("1 học sinh");
    expect(fmtCount(1204, "sự việc")).toBe("1.204 sự việc");
  });
});

describe("fmtDate / fmtDateTime / fmtTime (Vietnam time zone)", () => {
  it("formats calendar dates as dd/mm/yyyy", () => {
    expect(fmtDate("2026-10-21")).toBe("21/10/2026");
    expect(fmtDate("")).toBe("");
    expect(fmtDate(undefined)).toBe("");
    expect(fmtDate("not a date")).toBe("");
    expect(fmtDate("2026-02-30")).toBe("");
  });
  it("converts timestamps to the Vietnamese calendar day", () => {
    expect(fmtDate("2026-10-20T18:30:00.000Z")).toBe("21/10/2026"); // 01:30 on the 21st in VN
    expect(fmtDate(new Date("2026-10-20T16:59:00Z"))).toBe("20/10/2026");
  });
  it("formats date-times as dd/mm/yyyy HH:mm in UTC+7", () => {
    expect(fmtDateTime("2026-10-21T07:05:00.000Z")).toBe("21/10/2026 14:05");
    expect(fmtDateTime("2026-10-20T17:00:00Z")).toBe("21/10/2026 00:00");
    expect(fmtDateTime("2026-12-31T16:59:59Z")).toBe("31/12/2026 23:59");
    expect(fmtDateTime("2026-10-21")).toBe("21/10/2026");
    expect(fmtDateTime("garbage")).toBe("");
    expect(fmtDateTime("2026-02-30")).toBe("");
    expect(fmtDateTime(null)).toBe("");
  });
  it("formats times as HH:mm", () => {
    expect(fmtTime("2026-10-21T00:07:00Z")).toBe("07:07");
    expect(fmtTime("bad")).toBe("");
  });
});

describe("fmtRelative", () => {
  const now = new Date("2026-10-21T07:00:00Z"); // 14:00 in Vietnam
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("handles the recent past", () => {
    expect(fmtRelative(ago(10_000), now)).toBe("vừa xong");
    expect(fmtRelative(ago(5 * MIN), now)).toBe("5 phút trước");
    expect(fmtRelative(ago(59 * MIN), now)).toBe("59 phút trước");
    expect(fmtRelative(ago(3 * HOUR), now)).toBe("3 giờ trước");
  });
  it("uses calendar days for older dates", () => {
    expect(fmtRelative(ago(DAY), now)).toBe("hôm qua");
    expect(fmtRelative(ago(4 * DAY), now)).toBe("4 ngày trước");
    expect(fmtRelative(ago(10 * DAY), now)).toBe("11/10/2026");
    expect(fmtRelative("2026-10-20", now)).toBe("hôm qua");
  });
  it("keeps hours shortly after midnight", () => {
    const justAfterMidnight = new Date("2026-10-21T17:30:00Z"); // 00:30 on the 22nd (VN)
    expect(fmtRelative("2026-10-21T16:00:00Z", justAfterMidnight)).toBe("1 giờ trước");
    expect(fmtRelative("2026-10-21T08:00:00Z", justAfterMidnight)).toBe("hôm qua");
  });
  it("handles the future", () => {
    expect(fmtRelative(ago(-5 * MIN), now)).toBe("5 phút nữa");
    expect(fmtRelative(ago(-2 * HOUR), now)).toBe("2 giờ nữa");
    expect(fmtRelative(ago(-DAY), now)).toBe("ngày mai");
    expect(fmtRelative(ago(-5 * DAY), now)).toBe("26/10/2026");
  });
  it("returns an empty string for invalid input", () => {
    expect(fmtRelative(undefined, now)).toBe("");
    expect(fmtRelative("nope", now)).toBe("");
    expect(fmtRelative("2026-02-30", now)).toBe("");
  });
});

describe("fmtTopLabel", () => {
  it("names the Top group after config.top90Ratio", () => {
    expect(fmtTopLabel(0.9)).toBe("Top 90%");
    expect(fmtTopLabel(0.8)).toBe("Top 80%");
    expect(fmtTopLabel(1)).toBe("Top 100%");
  });
  it("falls back to the spec default when the ratio is unknown", () => {
    expect(fmtTopLabel()).toBe("Top 90%");
    expect(fmtTopLabel(null)).toBe("Top 90%");
    expect(fmtTopLabel(Number.NaN)).toBe("Top 90%");
  });
});
