import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { IssueStat, TrendPoint } from "@/lib/engine";
import type { LevelDataset, RankingRow } from "@/lib/types";
import {
  attentionClass,
  bestClass,
  levelIssues,
  levelPeriod,
  levelStudentCount,
  levelSummary,
  levelTrend,
  mergeTopIssues,
  mergeWeeklyTrends,
} from "../lib/school-model";

function asLevel(ds: LevelDataset, levelId: LevelDataset["levelId"]): LevelDataset {
  return { ...ds, levelId };
}

describe("levelPeriod", () => {
  it("resolves the current period of each mode from the level calendar", () => {
    const ds = makeFixtureDataset();
    expect(levelPeriod(ds, "week", FIXTURE_TODAY)).toEqual({ mode: "week", key: "2026-10-19" });
    expect(levelPeriod(ds, "month", FIXTURE_TODAY)).toEqual({ mode: "month", key: "2026-10" });
    expect(levelPeriod(ds, "semester", FIXTURE_TODAY)).toEqual({ mode: "semester", key: "HK1" });
    expect(levelPeriod(ds, "all", FIXTURE_TODAY)).toEqual({ mode: "all" });
  });

  it("falls back to the last past option after the calendar ends", () => {
    const ds = makeFixtureDataset();
    expect(levelPeriod(ds, "semester", "2027-07-15")).toEqual({ mode: "semester", key: "HK2" });
    expect(levelPeriod({ ...ds, weeks: [] }, "month", FIXTURE_TODAY)).toEqual({ mode: "all" });
  });
});

describe("levelStudentCount", () => {
  it("counts active students, or class sizes for redacted datasets", () => {
    const ds = makeFixtureDataset();
    expect(levelStudentCount(ds)).toBe(ds.students.filter((s) => s.status === "ACTIVE").length);
    const sizes = ds.classes.filter((c) => c.active).reduce((a, c) => a + (c.sourceSize ?? 0), 0);
    expect(levelStudentCount({ ...ds, redacted: true })).toBe(sizes);
    const noSize = { ...ds, redacted: true, classes: ds.classes.map((c) => ({ ...c, sourceSize: undefined })) };
    expect(levelStudentCount(noSize)).toBeUndefined();
  });
});

describe("levelSummary", () => {
  it("summarises a level for the current month", () => {
    const ds = makeFixtureDataset();
    const s = levelSummary(ds, "month", FIXTURE_TODAY);
    expect(s.name).toBe("Trung học cơ sở");
    expect(s.periodLabel).toBe("Tháng 10/2026");
    expect(s.classCount).toBe(8);
    expect(s.kpis.incidents).toBeGreaterThan(0);
    expect(Object.values(s.rag).reduce((a, b) => a + b, 0)).toBe(8);
    expect(s.attention?.classCode).toBe("6A03");
    expect(s.redClasses.map((r) => r.classCode)).toContain("6A03");
    expect(s.best?.classCode).not.toBe("6A03");
    expect(s.incidentsPer100).toBeCloseTo((s.kpis.incidents / (s.studentCount ?? 1)) * 100, 1);
    expect(s.penaltyPerClass).toBeCloseTo(s.kpis.penaltyPoints / 8, 1);
    expect(s.weeklyRedStudents).toBeGreaterThanOrEqual(1);
  });

  it("picks the attention class by penalty when thresholds are not approved", () => {
    const ds = makeFixtureDataset();
    ds.config.rag.approved = false;
    const s = levelSummary(ds, "month", FIXTURE_TODAY);
    expect(s.rag.GRAY).toBe(8);
    expect(s.redClasses).toEqual([]);
    expect(s.attention?.classCode).toBe("6A03");
  });
});

describe("best / attention class", () => {
  const row = (classCode: string, score: number, penaltyPoints: number, rag: RankingRow["rag"], avg = penaltyPoints): RankingRow => ({
    classCode,
    grade: 6,
    countedWeeks: 1,
    base: 100,
    rewardPoints: 0,
    penaltyPoints,
    score,
    rank: 1,
    gradeClassCount: 3,
    top90Cutoff: 3,
    inTop90: true,
    incidentCount: 1,
    relatedStudentCount: 1,
    avgWeeklyPenalty: avg,
    confidence: 1,
    rag,
    ragReason: "",
    highlighted: false,
  });

  it("orders ties deterministically", () => {
    expect(bestClass([row("6A02", 100, 0, "GREEN"), row("6A01", 100, 0, "GREEN")])?.classCode).toBe("6A01");
    expect(attentionClass([row("6A01", 90, 10, "YELLOW"), row("6A02", 70, 30, "RED")])?.classCode).toBe("6A02");
    expect(attentionClass([row("6A01", 100, 0, "GREEN")])).toBeUndefined();
    expect(bestClass([])).toBeUndefined();
  });
});

describe("mergeTopIssues", () => {
  it("merges the same error code + issue across levels", () => {
    const thcs = makeFixtureDataset();
    const th = asLevel(makeFixtureDataset(), "TH");
    const period = { mode: "month" as const, key: "2026-10" };
    const merged = mergeTopIssues(
      [
        { levelId: "THCS", issues: levelIssues(thcs, period) },
        { levelId: "TH", issues: levelIssues(th, period) },
      ],
      5,
    );
    const single = levelIssues(thcs, period);
    expect(merged).toHaveLength(5);
    expect(merged[0].incidents).toBe(single[0].incidents * 2);
    expect(merged[0].levels.map((l) => l.levelId)).toEqual(["THCS", "TH"]);
  });

  it("keeps different issues with the same code apart", () => {
    const a: IssueStat = { errorCode: "L01", issue: "Đi học muộn", category: "A", unit: "/HS", incidents: 3, violationTurns: 3, points: 6, students: 3, classCount: 2 };
    const b: IssueStat = { ...a, issue: "Không đeo khăn quàng", incidents: 5 };
    const merged = mergeTopIssues([
      { levelId: "TH", issues: [b] },
      { levelId: "THCS", issues: [a, { ...a, errorCode: "L02", issue: "Khác", incidents: 1 }] },
    ]);
    expect(merged.map((m) => [m.errorCode, m.issue])).toEqual([
      ["L01", "Không đeo khăn quàng"],
      ["L01", "Đi học muộn"],
      ["L02", "Khác"],
    ]);
  });
});

describe("mergeWeeklyTrends", () => {
  it("aligns levels on the union of weeks and normalises per class", () => {
    const ds = makeFixtureDataset();
    const trend = levelTrend(ds, FIXTURE_TODAY);
    const shorter: TrendPoint[] = trend.slice(2);
    const merged = mergeWeeklyTrends(
      [
        { levelId: "THCS", trend, classCount: 8 },
        { levelId: "TH", trend: shorter, classCount: 4 },
      ],
      "perClass",
    );
    expect(merged.weeks).toEqual(trend.map((t) => t.week));
    expect(merged.categories[0]).toMatch(/^\d{2}\/\d{2}$/);
    expect(merged.series[1].data.slice(0, 2)).toEqual([null, null]);
    const idx = merged.weeks.indexOf("2026-10-12");
    const point = trend.find((t) => t.week === "2026-10-12");
    expect(merged.series[0].data[idx]).toBeCloseTo((point?.points ?? 0) / 8, 2);
    expect(merged.series[1].data[idx]).toBeCloseTo((point?.points ?? 0) / 4, 2);
    const totals = mergeWeeklyTrends([{ levelId: "THCS", trend, classCount: 8 }], "total");
    expect(totals.series[0].data[idx]).toBe(point?.points);
    expect(totals.series[0].name).toBe("THCS");
  });
});

describe("schoolTotals", () => {
  it("sums levels and keeps previous totals only when every level has one", async () => {
    const { schoolTotals, schoolIncidents } = await import("../lib/school-model");
    const { dataConfidence } = await import("@/lib/engine");
    const a = levelSummary(makeFixtureDataset(), "month", FIXTURE_TODAY);
    const b = levelSummary(asLevel(makeFixtureDataset(), "TH"), "month", FIXTURE_TODAY);
    const t = schoolTotals([a, b]);
    expect(t.levels).toBe(2);
    expect(t.incidents).toBe(a.kpis.incidents * 2);
    expect(t.classCount).toBe(16);
    expect(t.redClasses).toBe(a.rag.RED * 2);
    expect(t.previous?.incidents).toBe((a.previous?.incidents ?? 0) * 2);
    const all = schoolTotals([levelSummary(makeFixtureDataset(), "all", FIXTURE_TODAY), a]);
    expect(all.previous).toBeUndefined();
    expect(schoolTotals([]).studentCount).toBeUndefined();
    const ds = makeFixtureDataset();
    const inc = schoolIncidents([{ ds, period: a.period }]);
    expect(inc).toHaveLength(a.kpis.incidents);
    expect(dataConfidence(inc)).toBeCloseTo(a.kpis.confidence, 6);
  });
});
