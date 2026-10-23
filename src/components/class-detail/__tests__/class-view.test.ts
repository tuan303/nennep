import { describe, expect, it } from "vitest";
import { buildRanking, classScoreSeries, classTimeline, filterIncidents, LEVEL_RANKING_GROUP } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { TODAY, makeClass, makeDataset, makeIncident, makeReward } from "@/lib/engine/__tests__/builders";
import type { Incident, LevelDataset, Period, StudentRef } from "@/lib/types";
import {
  classContacts,
  classSize,
  filterTimelineDays,
  foldSlices,
  gradeFromCode,
  incidentSubjects,
  lastValues,
  overviewSections,
  rankRuleHint,
  rankScopeText,
  scoreChartData,
  timelineTotals,
} from "../lib/class-view";

const OCTOBER: Period = { mode: "month", key: "2026-10" };

describe("classSize", () => {
  it("counts active students of the class only", () => {
    const ds = makeFixtureDataset();
    const c6a02 = ds.classes.find((c) => c.code === "6A02")!;
    // 7 active students + Vũ Hoàng Long (TRANSFERRED_OUT) in the roster
    expect(classSize(ds, c6a02, true)).toEqual({ value: 7, source: "roster" });
  });

  it("falls back to the imported size when the viewer cannot see the students", () => {
    const ds = makeFixtureDataset();
    const c6a01 = ds.classes.find((c) => c.code === "6A01")!;
    expect(classSize(ds, c6a01, false)).toEqual({ value: c6a01.sourceSize, source: "source" });
    expect(classSize(ds, { code: "6A01" }, false)).toEqual({ source: "hidden" });
    expect(classSize({ students: [] }, { code: "6A01" }, true)).toEqual({ source: "none" });
    expect(classSize({ students: [] }, { code: "6A01", sourceSize: 32 }, true)).toEqual({ value: 32, source: "source" });
  });
});

describe("incidentSubjects", () => {
  const base = { students: [], unnamedCount: 0, relatedStudentCount: 0 } satisfies Pick<
    Incident,
    "students" | "unnamedCount" | "relatedStudentCount"
  >;

  it("is the whole class when nobody is named or counted", () => {
    expect(incidentSubjects(base, false)).toMatchObject({ named: [], collective: true });
  });

  it("keeps named + unnamed students and drops duplicates", () => {
    const a = { id: "1", name: "A", classCode: "6A01" };
    const v = incidentSubjects({ students: [a, a, { id: "2", name: "B", classCode: "6A01" }], unnamedCount: 2, relatedStudentCount: 5 }, false);
    expect(v.named.map((s) => s.id)).toEqual(["1", "2"]);
    expect(v.unnamed).toBe(2);
    expect(v.collective).toBe(false);
  });

  it("hides names of redacted incidents but keeps the count", () => {
    const v = incidentSubjects({ students: [], unnamedCount: 0, relatedStudentCount: 3 }, true);
    expect(v).toEqual({ named: [], unnamed: 0, hiddenCount: 3, collective: false });
    expect(incidentSubjects(base, true).collective).toBe(true);
  });
});

describe("filterTimelineDays / timelineTotals", () => {
  it("returns the engine timeline unchanged without issue filters", () => {
    const ds = makeFixtureDataset();
    const days = classTimeline(ds, "6A03", OCTOBER);
    expect(filterTimelineDays(days, {})).toBe(days);
    const totals = timelineTotals(days);
    const inc = filterIncidents(ds, { period: OCTOBER, classCode: "6A03" });
    expect(totals.incidents).toBe(inc.length);
    expect(totals.points).toBe(inc.reduce((a, i) => a + i.points, 0));
  });

  it("filters by category and recomputes day totals", () => {
    const ds = makeFixtureDataset();
    const days = classTimeline(ds, "6A03", OCTOBER);
    const cat = "Chuyên cần – vệ sinh";
    const filtered = filterTimelineDays(days, { category: cat });
    const inc = filterIncidents(ds, { period: OCTOBER, classCode: "6A03", category: cat });
    expect(timelineTotals(filtered)).toMatchObject({ incidents: inc.length, points: inc.reduce((a, i) => a + i.points, 0) });
    expect(filtered.every((d) => d.items.length > 0 && d.items.every((i) => i.category === cat))).toBe(true);
    // newest day first is preserved
    expect(filtered.map((d) => d.date)).toEqual([...filtered.map((d) => d.date)].sort().reverse());
  });

  it("filters by error code", () => {
    const ds = makeFixtureDataset();
    const filtered = filterTimelineDays(classTimeline(ds, "6A03", OCTOBER), { errorCode: "L35" });
    expect(timelineTotals(filtered)).toEqual({ days: 1, incidents: 1, points: 20 });
  });
});

describe("scoreChartData", () => {
  it("maps the engine series to chart inputs", () => {
    const ds = makeFixtureDataset();
    const series = classScoreSeries(ds, "6A03", FIXTURE_TODAY);
    const chart = scoreChartData(series);
    expect(chart.categories).toHaveLength(series.length);
    expect(chart.categories[0]).toMatch(/^\d{2}\/\d{2}$/);
    expect(chart.score).toEqual(series.map((p) => p.score));
    expect(chart.penalty).toEqual(series.map((p) => p.penalty));
    expect(lastValues(chart.score, 3)).toEqual(chart.score.slice(-3));
    expect(lastValues([1, 2], 5)).toEqual([1, 2]);
  });
});

describe("classContacts / gradeFromCode", () => {
  it("builds tel/mailto links only for plausible values", () => {
    expect(classContacts({ homeroomPhone: "0912 345 678", homeroomEmail: "ha.nt@nshm.edu.vn" })).toEqual([
      { kind: "phone", label: "0912 345 678", href: "tel:0912345678" },
      { kind: "email", label: "ha.nt@nshm.edu.vn", href: "mailto:ha.nt@nshm.edu.vn" },
    ]);
    expect(classContacts({ homeroomPhone: "12", homeroomEmail: "không có" })).toEqual([]);
    expect(classContacts({})).toEqual([]);
  });

  it("reads the grade of a class code", () => {
    expect(gradeFromCode("10A1")).toBe(10);
    expect(gradeFromCode("6A03")).toBe(6);
    expect(gradeFromCode("ABC")).toBeUndefined();
  });
});

describe("foldSlices", () => {
  it("drops zeros, sorts and folds the tail into Khác", () => {
    const items = [
      { name: "A", value: 1 },
      { name: "B", value: 0 },
      { name: "C", value: 5 },
      { name: "D", value: 3 },
      { name: "E", value: 2 },
    ];
    expect(foldSlices(items, 10).map((d) => d.name)).toEqual(["C", "D", "E", "A"]);
    expect(foldSlices(items, 3)).toEqual([
      { name: "C", value: 5 },
      { name: "D", value: 3 },
      { name: "Khác", value: 3 },
    ]);
  });
});

/* ---------------------------- THPT: level-wide ranking ---------------------------- */

const WEEK_19: Period = { mode: "week", key: "2026-10-19" };
const stu = (n: number): StudentRef[] => Array.from({ length: n }, (_, i) => ({ id: `S${i}`, name: `HS ${i}`, classCode: "x" }));

/** Week of 19/10: 10A1, 11A1 = 100 (clean) · 12A1 = 100 (+2 −2, 1 lượt) · 12A2 = 96 (1 lượt) · 10A2 = 96 (2 lượt). */
function thpt(): LevelDataset {
  return makeDataset({
    levelId: "THPT",
    classes: [makeClass("10A1", 10), makeClass("10A2", 10), makeClass("11A1", 11), makeClass("12A1", 12), makeClass("12A2", 12)],
    incidents: [
      makeIncident({ date: "2026-10-20", classCode: "12A1", grade: 12, penalty: 2, students: stu(1) }),
      makeIncident({ date: "2026-10-20", classCode: "12A2", grade: 12, penalty: 4, points: 4, unit: "/lần" }),
      makeIncident({ date: "2026-10-21", classCode: "10A2", grade: 10, penalty: 2, students: stu(2) }),
    ],
    rewards: [makeReward({ date: "2026-10-20", classCode: "12A1", grade: 12, points: 2, status: "Đã xác nhận" })],
  });
}

describe("ranking wording (RankingRule of the level)", () => {
  it("names where a class is ranked", () => {
    expect(rankScopeText("THCS", 6)).toBe("trong khối 6");
    expect(rankScopeText("TH")).toBe("trong khối");
    expect(rankScopeText("THPT", 10)).toBe("toàn cấp");
    expect(rankScopeText("THPT")).toBe("toàn cấp");
  });

  it("explains the population and the tie-break", () => {
    expect(rankRuleHint("THCS")).toBe("Xếp hạng theo điểm thi đua trong các lớp cùng khối; bằng điểm thì đồng hạng.");
    expect(rankRuleHint("THPT")).toBe(
      "Xếp hạng chung toàn cấp theo điểm thi đua; bằng điểm thì lớp ít lượt vi phạm hơn xếp trên, bằng cả điểm và lượt vi phạm thì đồng hạng.",
    );
  });
});

describe("overviewSections", () => {
  it("THCS: one section per khối, unchanged", () => {
    const ds = makeFixtureDataset();
    const sections = overviewSections(buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades);
    expect(sections.map((s) => [s.title, s.description])).toEqual([
      ["Khối 6", "5 lớp · sắp xếp theo hạng thi đua"],
      ["Khối 7", "3 lớp · sắp xếp theo hạng thi đua"],
    ]);
    const g7 = overviewSections(buildRanking(ds, OCTOBER, FIXTURE_TODAY, { grade: 7 }).grades, 7);
    expect(g7.map((s) => s.title)).toEqual(["Khối 7"]);
  });

  it("THPT: one 'Toàn cấp' section in level rank order (ties by lượt vi phạm)", () => {
    const grades = buildRanking(thpt(), WEEK_19, TODAY).grades;
    expect(grades.map((g) => g.grade)).toEqual([LEVEL_RANKING_GROUP]);
    const [all] = overviewSections(grades);
    expect(all.title).toBe("Toàn cấp");
    expect(all.description).toBe("5 lớp · sắp xếp theo hạng thi đua toàn cấp");
    expect(all.rows.map((r) => [r.classCode, r.rank])).toEqual([
      ["10A1", 1],
      ["11A1", 1],
      ["12A1", 3],
      ["12A2", 4],
      ["10A2", 5],
    ]);
  });

  it("THPT + khối filter: only that khối's classes, ranks stay level-wide", () => {
    const grades = buildRanking(thpt(), WEEK_19, TODAY, { grade: 10 }).grades;
    const sections = overviewSections(grades, 10);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Khối 10");
    expect(sections[0].description).toBe("2 lớp · sắp xếp theo hạng thi đua toàn cấp (5 lớp)");
    expect(sections[0].rows.map((r) => [r.classCode, r.rank, r.gradeClassCount])).toEqual([
      ["10A1", 1, 5],
      ["10A2", 5, 5],
    ]);
    expect(overviewSections(grades, 9)).toEqual([]);
  });

  it("THPT weekly rank series: level-wide with the tie-break", () => {
    const chart = scoreChartData(classScoreSeries(thpt(), "10A2", TODAY));
    expect(chart.rank.at(-1)).toBe(5);
    expect(chart.score.at(-1)).toBe(96);
  });
});
