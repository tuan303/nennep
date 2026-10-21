import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { buildRanking, classStats, computeKpis, kpiComparison, weekdayDistribution, weeklyTrend } from "@/lib/engine";
import { KPI_TERMS } from "@/lib/constants";
import type { GlobalFilters, UserProfile } from "@/lib/types";
import {
  buildKpiViews,
  confidenceTone,
  contextPeriod,
  deltaLabel,
  myClassRows,
  pendingRewards,
  priorityClasses,
  ragSummary,
  sparkWeeks,
  trendHighlight,
  type KpiId,
} from "../lib/overview-model";
import { hrefWithParams, share, unitLabel, weekdayBars } from "../lib/view-helpers";

const WEEK: GlobalFilters = { period: { mode: "week", key: "2026-10-12" } };
const OCT: GlobalFilters = { period: { mode: "month", key: "2026-10" } };
const EMPTY_SPARK: Record<KpiId, number[]> = { incidents: [], turns: [], students: [], penalty: [], reward: [], confidence: [] };

describe("deltaLabel / confidenceTone", () => {
  it("labels the comparison by period mode", () => {
    expect(deltaLabel("week")).toBe("so với tuần trước");
    expect(deltaLabel("month")).toBe("so với tháng trước");
    expect(deltaLabel("semester")).toBe("so với học kỳ trước");
    expect(deltaLabel("all")).toBeUndefined();
  });

  it("grades data confidence against the threshold", () => {
    expect(confidenceTone(0.95, 0.8)).toBe("ok");
    expect(confidenceTone(0.8, 0.8)).toBe("ok");
    expect(confidenceTone(0.75, 0.8)).toBe("warn");
    expect(confidenceTone(0.5, 0.8)).toBe("bad");
  });
});

describe("buildKpiViews", () => {
  it("builds the 6 SCR-02 tiles with deltas vs the previous week", () => {
    const ds = makeFixtureDataset();
    const cmp = kpiComparison(ds, WEEK);
    const views = buildKpiViews({
      current: cmp.current,
      previous: cmp.previous,
      mode: "week",
      classTotal: classStats(ds, WEEK).length,
      minConfidence: ds.config.rag.minConfidence,
      pendingReward: pendingRewards(ds, WEEK),
      countedStatuses: ds.config.rewardCountedStatuses,
      spark: EMPTY_SPARK,
    });
    expect(views.map((v) => v.id)).toEqual(["incidents", "turns", "students", "penalty", "reward", "confidence"]);
    const byId = Object.fromEntries(views.map((v) => [v.id, v]));
    expect(byId.incidents.value).toBe(cmp.current.incidents);
    expect(byId.incidents.delta).toEqual({ value: cmp.current.incidents - (cmp.previous?.incidents ?? 0), goodWhen: "down", label: "so với tuần trước" });
    expect(byId.reward.delta?.goodWhen).toBe("up");
    expect(byId.confidence.delta?.goodWhen).toBe("up");
    expect(byId.incidents.note).toBe(`${cmp.current.classesWithIncidents}/8 lớp phát sinh`);
    expect(byId.turns.value).toBe(cmp.current.violationTurns);
    expect(byId.turns.delta?.value).toBe(cmp.current.violationTurns - (cmp.previous?.violationTurns ?? 0));
    expect(byId.students.value).toBe(cmp.current.uniqueStudents);
    // Shared vocabulary (REQ_V2 §13): identical labels and tooltips on every screen.
    expect([byId.incidents, byId.turns, byId.students, byId.penalty].map((v) => [v.label, v.hint])).toEqual(
      (["incidents", "violationTurns", "uniqueStudents", "penaltyPoints"] as const).map((k) => [KPI_TERMS[k].label, KPI_TERMS[k].hint]),
    );
    // 7A03 has a REVIEW record in week 12/10 → confidence < 100%.
    expect(cmp.current.reviewCount).toBeGreaterThan(0);
    expect(byId.confidence.note).toBe(`${cmp.current.reviewCount} bản ghi cần rà soát`);
    expect(byId.confidence.delta?.display).toMatch(/điểm %$/);
  });

  it("has no deltas for the whole school year", () => {
    const ds = makeFixtureDataset();
    const f: GlobalFilters = { period: { mode: "all" } };
    const cmp = kpiComparison(ds, f);
    const views = buildKpiViews({
      current: cmp.current,
      previous: cmp.previous,
      mode: "all",
      classTotal: 8,
      minConfidence: 0.8,
      pendingReward: { points: 0, count: 0 },
      countedStatuses: ["Đã xác nhận"],
      spark: EMPTY_SPARK,
    });
    expect(views.every((v) => v.delta === undefined)).toBe(true);
    expect(views.find((v) => v.id === "reward")?.note).toBeUndefined();
  });

  it("mentions pending rewards in the reward tile", () => {
    const ds = makeFixtureDataset();
    const pending = pendingRewards(ds, OCT);
    // October: 7A03 (5, Đang xác minh), 6A05 (5, Đang xác minh), 7A01 (8, Mới ghi nhận), 6A03 (3, Mới ghi nhận).
    expect(pending).toEqual({ points: 21, count: 4 });
    const views = buildKpiViews({
      current: computeKpis(ds, OCT),
      mode: "month",
      classTotal: 8,
      minConfidence: 0.8,
      pendingReward: pending,
      countedStatuses: ["Đã xác nhận"],
      spark: EMPTY_SPARK,
    });
    const reward = views.find((v) => v.id === "reward");
    expect(reward?.note).toBe("21 điểm chờ xác minh");
    expect(reward?.hint).toContain("Đã xác nhận");
    expect(reward?.hint?.startsWith(KPI_TERMS.rewardPoints.hint)).toBe(true);
  });

  it("notes the unnamed students under Số HS vi phạm", () => {
    const base = { incidents: 3, violationTurns: 6, relatedStudents: 6, uniqueStudents: 3, penaltyPoints: 12, rewardPoints: 0, classesWithIncidents: 2, confidence: 1, reviewCount: 0 };
    const view = (unnamedStudentCount: number) =>
      buildKpiViews({
        current: { ...base, unnamedStudentCount },
        mode: "all",
        classTotal: 8,
        minConfidence: 0.8,
        pendingReward: { points: 0, count: 0 },
        countedStatuses: ["Đã xác nhận"],
        spark: EMPTY_SPARK,
      }).find((v) => v.id === "students");
    expect(view(3)?.note).toBe("+ 3 HS chưa rõ tên");
    expect(view(0)?.note).toBeUndefined();
  });
});

describe("trend helpers", () => {
  it("highlights the weeks of the selected period", () => {
    const ds = makeFixtureDataset();
    const trend = weeklyTrend(ds, OCT, FIXTURE_TODAY);
    const flags = trendHighlight(trend, OCT.period, ds.weeks);
    const highlighted = trend.filter((_, i) => flags[i]).map((t) => t.week);
    expect(highlighted).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(trendHighlight(trend, { mode: "all" }, ds.weeks).some(Boolean)).toBe(false);
  });

  it("ends the sparkline window with the selected period", () => {
    const ds = makeFixtureDataset();
    const trend = weeklyTrend(ds, WEEK, FIXTURE_TODAY);
    expect(sparkWeeks(trend, WEEK.period, ds.weeks, 4)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    const all = sparkWeeks(trend, { mode: "all" }, ds.weeks, 3);
    expect(all[all.length - 1]).toBe("2026-10-19");
    expect(sparkWeeks([], WEEK.period, ds.weeks)).toEqual([]);
  });

  it("widens a week to its semester for context charts", () => {
    const ds = makeFixtureDataset();
    expect(contextPeriod(WEEK.period, ds.weeks)).toEqual({ period: { mode: "semester", key: "HK1" }, widened: true });
    expect(contextPeriod(OCT.period, ds.weeks)).toEqual({ period: OCT.period, widened: false });
    expect(contextPeriod({ mode: "week", key: "2030-01-07" }, ds.weeks)).toEqual({ period: { mode: "all" }, widened: true });
  });
});

describe("ragSummary / priorityClasses / myClassRows", () => {
  it("counts RAG over the population, worst first", () => {
    const ds = makeFixtureDataset();
    const ranking = buildRanking(ds, OCT.period, FIXTURE_TODAY, { highlightClass: "6A03" });
    const s = ragSummary(ranking.grades);
    expect(s.total).toBe(8);
    expect(s.counts.RED).toBeGreaterThanOrEqual(1);
    expect(s.rows[0].classCode).toBe("6A03");
    expect(s.rows[0].rag).toBe("RED");
    expect(s.highlighted?.classCode).toBe("6A03");
    expect(Object.values(s.counts).reduce((a, b) => a + b, 0)).toBe(8);
    const g7 = ragSummary(ranking.grades, 7);
    expect(g7.total).toBe(3);
    expect(g7.highlighted).toBeUndefined();
  });

  it("joins the top classes with their ranking rows", () => {
    const ds = makeFixtureDataset();
    const ranking = buildRanking(ds, OCT.period, FIXTURE_TODAY);
    const top = priorityClasses(classStats(ds, OCT), ranking, 3);
    expect(top).toHaveLength(3);
    expect(top[0].classCode).toBe("6A03");
    expect(top[0].row?.rag).toBe("RED");
    expect(top.every((c) => c.incidents > 0)).toBe(true);
  });

  it("returns the GVCN's own classes only", () => {
    const ds = makeFixtureDataset();
    const ranking = buildRanking(ds, OCT.period, FIXTURE_TODAY);
    const gvcn: Pick<UserProfile, "role" | "gvcnClasses"> = {
      role: "GVCN",
      gvcnClasses: [
        { levelId: "THCS", classCode: "6A03" },
        { levelId: "TH", classCode: "1A1" },
      ],
    };
    expect(myClassRows(gvcn, "THCS", ranking).map((r) => r.classCode)).toEqual(["6A03"]);
    expect(myClassRows({ role: "VIEWER", gvcnClasses: [] }, "THCS", ranking)).toEqual([]);
    expect(myClassRows(undefined, "THCS", ranking)).toEqual([]);
  });
});

describe("small helpers", () => {
  it("shortens weekdays and drops empty weekend days", () => {
    const ds = makeFixtureDataset();
    const bars = weekdayBars(weekdayDistribution(ds.incidents));
    expect(bars.labels).toEqual(["T2", "T3", "T4", "T5", "T6"]);
    expect(bars.full[0]).toBe("Thứ Hai");
    const withSat = weekdayBars([0, 1, 2, 3, 4, 5, 6].map((i) => ({ weekday: `d${i}`, incidents: i === 5 ? 2 : 1 })).map((d, i) => (i === 6 ? { ...d, incidents: 0 } : d)));
    expect(withSat.labels).toEqual(["T2", "T3", "T4", "T5", "T6", "T7"]);
  });

  it("keeps the current filters when drilling down", () => {
    expect(hrefWithParams("/lop", "mode=week&key=2026-10-12&err=L01", { class: "6A03" })).toBe("/lop?mode=week&key=2026-10-12&err=L01&class=6A03");
    expect(hrefWithParams("/xep-hang", "")).toBe("/xep-hang");
    expect(hrefWithParams("/lop", "class=6A01&grade=6", { class: undefined })).toBe("/lop?grade=6");
  });

  it("labels units and computes shares", () => {
    expect(unitLabel("/HS")).toBe("Tính theo HS");
    expect(unitLabel("/lần")).toBe("Tính theo lần");
    expect(share(5, 10)).toBe(0.5);
    expect(share(5, 0)).toBe(0);
    expect(share(20, 10)).toBe(1);
  });
});

describe("categorySlices", () => {
  it("colours by catalog order and folds the tail into Khác", async () => {
    const { categorySlices, OTHER_SLICE } = await import("../lib/view-helpers");
    const { CHART_COLORS, CHART_OTHER_COLOR } = await import("@/components/charts/theme");
    const order = ["A", "B", "C"];
    const slices = categorySlices(
      [
        { category: "C", incidents: 5, points: 2 },
        { category: "A", incidents: 1, points: 9 },
        { category: "Z", incidents: 0, points: 0 },
      ],
      order,
      "points",
    );
    expect(slices).toEqual([
      { name: "A", value: 9, color: CHART_COLORS[0] },
      { name: "C", value: 2, color: CHART_COLORS[2] },
    ]);
    const many = Array.from({ length: 10 }, (_, i) => ({ category: `K${i}`, incidents: 10 - i, points: 0 }));
    const folded = categorySlices(many, [], "incidents");
    expect(folded).toHaveLength(8);
    expect(folded[7]).toEqual({ name: OTHER_SLICE, value: 3 + 2 + 1, color: CHART_OTHER_COLOR });
  });
});

describe("cross-filter widgets keep the other items (UX-10)", () => {
  it("scopes: the Mảng chart ignores Mảng and error, Top 5 ignores the error", async () => {
    const { crossFilterScopes } = await import("../lib/overview-model");
    const f: GlobalFilters = { period: { mode: "month", key: "2026-10" }, grade: 6, category: "Chuyên cần – vệ sinh", errorCode: "L01" };
    const { category, error } = crossFilterScopes(f);
    expect(category).toMatchObject({ period: f.period, grade: 6, category: undefined, errorCode: undefined });
    expect(error).toMatchObject({ period: f.period, grade: 6, category: "Chuyên cần – vệ sinh", errorCode: undefined });
  });

  it("after a click on a slice / row the widget still lists the others, with the selection emphasised", async () => {
    const { crossFilterScopes, selectedCategory, topIssueRows } = await import("../lib/overview-model");
    const { categorySlices, fadeColor } = await import("../lib/view-helpers");
    const { categoryBreakdown, filterIncidents } = await import("@/lib/engine");
    const ds = makeFixtureDataset();
    const order = [...new Set(ds.catalog.map((c) => c.category))];

    // "Phân bổ theo mảng": click "Học tập – truy bài".
    const picked: GlobalFilters = { ...OCT, category: "Học tập – truy bài" };
    expect(categoryBreakdown(filterIncidents(ds, picked))).toHaveLength(1); // the old input: one 100 % slice
    const slices = categorySlices(categoryBreakdown(filterIncidents(ds, crossFilterScopes(picked).category)), order, "incidents", selectedCategory(picked, ds.catalog));
    expect(slices.length).toBeGreaterThan(1);
    const sel = slices.find((s) => s.name === "Học tập – truy bài")!;
    expect(sel.color).toBe(categorySlices(categoryBreakdown(filterIncidents(ds, OCT)), order, "incidents").find((s) => s.name === sel.name)!.color);
    const plain = categorySlices(categoryBreakdown(filterIncidents(ds, crossFilterScopes(picked).category)), order, "incidents");
    for (const s of slices) {
      if (s.name !== sel.name) expect(s.color).toBe(fadeColor(plain.find((p) => p.name === s.name)!.color));
    }

    // "Top 5 vấn đề": click L05.
    const clicked: GlobalFilters = { ...OCT, errorCode: "L05" };
    const rows = topIssueRows(filterIncidents(ds, crossFilterScopes(clicked).error), "L05");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.some((r) => r.errorCode === "L05")).toBe(true);
    // The Mảng of a filtered error is emphasised in the ring.
    expect(selectedCategory(clicked, ds.catalog)).toBe("Học tập – truy bài");
  });

  it("appends the selected error with its rank when it is outside the top 5", async () => {
    const { topIssueRows } = await import("../lib/overview-model");
    const { filterIncidents } = await import("@/lib/engine");
    const ds = makeFixtureDataset();
    const all = topIssueRows(filterIncidents(ds, { period: { mode: "all" } }), undefined, 99);
    expect(all.length).toBeGreaterThan(5);
    const last = all[all.length - 1];
    const rows = topIssueRows(filterIncidents(ds, { period: { mode: "all" } }), last.errorCode, 5);
    expect(rows).toHaveLength(6);
    expect(rows[5]).toMatchObject({ errorCode: last.errorCode, rank: all.length });
    expect(topIssueRows([], "L01")).toEqual([]);
  });

  it("fades colours towards white", async () => {
    const { fadeColor } = await import("../lib/view-helpers");
    expect(fadeColor("#000000", 0.5)).toBe("#808080");
    expect(fadeColor("#2b3a9e", 0)).toBe("#2b3a9e");
    expect(fadeColor("rgb(0,0,0)")).toBe("rgb(0,0,0)");
  });
});
