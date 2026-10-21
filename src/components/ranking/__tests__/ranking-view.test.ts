import { describe, expect, it } from "vitest";
import { buildRanking, classScoreSeries, previousPeriod } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { Period } from "@/lib/types";
import {
  classBreakdown,
  classDetailHref,
  gradeSummary,
  medalTier,
  periodIncludesCurrentWeek,
  previousPeriodNoun,
  rankDeltas,
  rankingFileName,
  top90DividerIndex,
  trendWindow,
} from "../lib/ranking-view";

const OCTOBER: Period = { mode: "month", key: "2026-10" };

describe("gradeSummary", () => {
  it("summarises a grade from engine rows", () => {
    const ds = makeFixtureDataset();
    const ranking = buildRanking(ds, OCTOBER, FIXTURE_TODAY);
    const g6 = ranking.grades.find((g) => g.grade === 6)!;
    const s = gradeSummary(g6);
    expect(s.classCount).toBe(5);
    expect(s.cutoff).toBe(5); // ceil(0.9 × 5)
    expect(s.outsideCount).toBe(0);
    const mean = g6.rows.reduce((a, r) => a + r.score, 0) / 5;
    expect(s.avgScore).toBeCloseTo(mean, 2);
    expect(s.rag.RED).toBeGreaterThanOrEqual(1); // 6A03 is RED in October
    expect(Object.values(s.rag).reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("handles an empty grade", () => {
    expect(gradeSummary({ grade: 9, rows: [] })).toMatchObject({ classCount: 0, cutoff: 0, avgScore: 0, outsideCount: 0 });
  });
});

describe("top90DividerIndex", () => {
  it("is -1 when every class is inside Top 90%", () => {
    const ds = makeFixtureDataset();
    const g6 = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades[0];
    expect(top90DividerIndex(g6.rows)).toBe(-1);
  });

  it("points at the first class outside Top 90% (ties at the cutoff stay inside)", () => {
    const ds = makeFixtureDataset();
    ds.config.top90Ratio = 0.6; // grade 6: ceil(3) = 3
    const g6 = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades[0];
    const idx = top90DividerIndex(g6.rows);
    expect(idx).toBeGreaterThan(0);
    expect(g6.rows[idx].inTop90).toBe(false);
    expect(g6.rows[idx - 1].inTop90).toBe(true);
    expect(g6.rows.slice(0, idx).every((r) => r.rank <= 3)).toBe(true);
  });

  it("is -1 when no class is inside", () => {
    const ds = makeFixtureDataset();
    const rows = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades[0].rows.map((r) => ({ ...r, inTop90: false }));
    expect(top90DividerIndex(rows)).toBe(-1);
  });
});

describe("rankDeltas", () => {
  it("compares with the previous period (positive = moved up)", () => {
    const ds = makeFixtureDataset();
    const prev = previousPeriod(OCTOBER, ds.weeks, ds.config.semesters)!;
    expect(prev).toEqual({ mode: "month", key: "2026-09" });
    const now = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades;
    const before = buildRanking(ds, prev, FIXTURE_TODAY).grades;
    const deltas = rankDeltas(now, before);
    expect(deltas.size).toBe(8);
    for (const g of now) {
      for (const r of g.rows) {
        const p = before.flatMap((x) => x.rows).find((x) => x.classCode === r.classCode)!;
        expect(deltas.get(r.classCode)).toBe(p.rank - r.rank);
      }
    }
  });

  it("is empty without a previous ranking", () => {
    const ds = makeFixtureDataset();
    expect(rankDeltas(buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades, undefined).size).toBe(0);
  });
});

describe("classBreakdown", () => {
  it("lists the penalties by error and splits counted / pending rewards", () => {
    const ds = makeFixtureDataset();
    const b = classBreakdown(ds, "6A03", OCTOBER);
    const row = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades[0].rows.find((r) => r.classCode === "6A03")!;
    expect(b.incidents.length).toBe(row.incidentCount);
    expect(b.issues.reduce((a, i) => a + i.points, 0)).toBe(row.penaltyPoints);
    // 6A03 has one "Mới ghi nhận" reward in October → pending, not counted.
    expect(b.counted).toHaveLength(0);
    expect(b.pending.map((r) => r.status)).toEqual(["Mới ghi nhận"]);
    expect(b.unnamedCount).toBe(1);
  });

  it("counts verified rewards in the score", () => {
    const ds = makeFixtureDataset();
    const b = classBreakdown(ds, "6A01", OCTOBER);
    const row = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades[0].rows.find((r) => r.classCode === "6A01")!;
    expect(b.counted.reduce((a, r) => a + r.points, 0)).toBe(row.rewardPoints);
    expect(b.counted[0].reason).toMatch(/tiến bộ/);
  });

  it("flags review records", () => {
    const ds = makeFixtureDataset();
    expect(classBreakdown(ds, "7A03", OCTOBER).reviewCount).toBe(2);
  });
});

describe("trendWindow", () => {
  it("ends at the last week of a past period and keeps the last N points", () => {
    const ds = makeFixtureDataset();
    const series = classScoreSeries(ds, "6A03", FIXTURE_TODAY);
    const sept = trendWindow(series, { mode: "month", key: "2026-09" }, ds.weeks, 3);
    const expected = series
      .filter((p) => p.week <= "2026-09-28")
      .slice(-3)
      .map((p) => p.score);
    expect(sept).toEqual(expected);
  });

  it("uses the whole series for the school year", () => {
    const ds = makeFixtureDataset();
    const series = classScoreSeries(ds, "6A01", FIXTURE_TODAY);
    expect(trendWindow(series, { mode: "all" }, ds.weeks, 100)).toEqual(series.map((p) => p.score));
    expect(trendWindow(series, { mode: "all" }, ds.weeks, 4)).toHaveLength(4);
  });
});

describe("small helpers", () => {
  it("detects the week in progress", () => {
    const ds = makeFixtureDataset();
    expect(periodIncludesCurrentWeek(OCTOBER, ds.weeks, FIXTURE_TODAY)).toBe(true);
    expect(periodIncludesCurrentWeek({ mode: "month", key: "2026-09" }, ds.weeks, FIXTURE_TODAY)).toBe(false);
    expect(periodIncludesCurrentWeek({ mode: "week", key: "2026-10-19" }, ds.weeks, FIXTURE_TODAY)).toBe(true);
  });

  it("names the previous period", () => {
    expect(previousPeriodNoun("week")).toBe("tuần trước");
    expect(previousPeriodNoun("semester")).toBe("học kỳ trước");
    expect(previousPeriodNoun("all")).toBe("");
  });

  it("builds a safe export file name", () => {
    expect(rankingFileName("THCS", "Tuần 12/10 – 18/10/2026")).toBe("NSHM_Xep-hang_THCS_Tuần 12-10 – 18-10-2026.xlsx");
    expect(rankingFileName("THPT", "Tháng 10/2026", 10)).toBe("NSHM_Xep-hang_THPT_Khoi-10_Tháng 10-2026.xlsx");
  });

  it("links to the class page keeping the period but not the grade", () => {
    expect(classDetailHref("mode=month&key=2026-10&grade=7&err=L01", "6A03")).toBe("/lop?mode=month&key=2026-10&err=L01&class=6A03");
    expect(classDetailHref("", "7A01")).toBe("/lop?class=7A01");
  });

  it("maps ranks to medals", () => {
    expect([1, 2, 3, 4].map(medalTier)).toEqual(["gold", "silver", "bronze", "none"]);
  });
});
