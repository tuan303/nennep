/**
 * Smoke test: every dashboard card renders (server-side, no effects) with the fixture dataset, including a GVCN-like
 * redacted dataset and an empty level, without throwing. Charts render their lazy placeholders here.
 */
import * as React from "react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { buildRanking, classStats, filterIncidents, weeklyTrend } from "@/lib/engine";
import type { GlobalFilters, LevelDataset } from "@/lib/types";
import { contextPeriod } from "../lib/overview-model";
import { CategoryCard, WeekdayCard } from "../overview/distribution-cards";
import { FiveSCard } from "../overview/five-s-card";
import { GradeCard } from "../overview/grade-card";
import { HeatmapCard } from "../overview/heatmap-card";
import { MyClassCard } from "../overview/my-class-card";
import { PriorityClassesCard } from "../overview/priority-classes-card";
import { RagCard } from "../overview/rag-card";
import { RecidivismCard } from "../overview/recidivism-card";
import { TopIssuesCard } from "../overview/top-issues-card";
import { TrendCard } from "../overview/trend-card";
import { KpiRow } from "../overview/kpi-row";
import { buildKpiViews, type KpiId } from "../lib/overview-model";
import { levelSummary, mergeWeeklyTrends, levelTrend } from "../lib/school-model";
import { LevelCard } from "../school/level-card";
import { CompareCard, SchoolTrendCard } from "../school/school-charts";
import { SchoolAlertsCard, SchoolIssuesCard } from "../school/school-lists";

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve" is for Next), which needs a global React.
(globalThis as { React?: typeof React }).React = React;

const noop = () => undefined;

function render<P extends object>(C: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(createElement(C, props));
}

/** GVCN of 6A03: other classes keep aggregates but lose student names. */
function redacted(ds: LevelDataset): LevelDataset {
  return {
    ...ds,
    redacted: true,
    students: ds.students.filter((s) => s.classCode === "6A03"),
    incidents: ds.incidents.map((i) => (i.classCode === "6A03" ? i : { ...i, students: [], detail: undefined })),
  };
}

function emptyLevel(ds: LevelDataset): LevelDataset {
  return { ...ds, incidents: [], rewards: [] };
}

const CASES: Array<[string, LevelDataset, GlobalFilters]> = [
  ["week", makeFixtureDataset(), { period: { mode: "week", key: "2026-10-12" } }],
  ["month + grade", makeFixtureDataset(), { period: { mode: "month", key: "2026-10" }, grade: 6 }],
  ["redacted GVCN", redacted(makeFixtureDataset()), { period: { mode: "semester", key: "HK1" } }],
  ["empty level", emptyLevel(makeFixtureDataset()), { period: { mode: "all" } }],
  ["not approved", { ...makeFixtureDataset(), config: { ...makeFixtureDataset().config, rag: { ...makeFixtureDataset().config.rag, approved: false } } }, { period: { mode: "month", key: "2026-10" } }],
];

describe.each(CASES)("overview cards (%s)", (_name, ds, filters) => {
  const today = FIXTURE_TODAY;
  const incidents = filterIncidents(ds, filters);
  const ranking = buildRanking(ds, filters.period, today, { highlightClass: "6A03" });
  const context = contextPeriod(filters.period, ds.weeks);

  it("renders without throwing", () => {
    const html = [
      render(TrendCard, { ds, trend: weeklyTrend(ds, filters, today), period: filters.period, onPickWeek: noop }),
      render(RagCard, { ds, ranking, grade: filters.grade, onOpenClass: noop }),
      render(TopIssuesCard, { ds, incidents, errorCode: undefined, onPick: noop }),
      render(PriorityClassesCard, { ds, classes: classStats(ds, filters), ranking, mine: ["6A03"], onOpenClass: noop }),
      render(GradeCard, { ds, filters, today, onPickGrade: noop }),
      render(CategoryCard, { ds, incidents, categoryOrder: [...new Set(ds.catalog.map((c) => c.category))], category: undefined, onPick: noop }),
      render(WeekdayCard, { ds, incidents }),
      render(HeatmapCard, { ds, filters, today, context, onPickCell: noop }),
      render(FiveSCard, { ds, filters, today, totalPenalty: 10, context, onOpenClass: noop }),
      render(RecidivismCard, { ds, filters, today, context, onOpenClass: noop, onOpenStudent: noop }),
      render(MyClassCard, { levelId: ds.levelId, rows: ranking.grades.flatMap((g) => g.rows).filter((r) => r.classCode === "6A03"), periodText: "Tháng 10/2026", onOpenClass: noop }),
    ].join("");
    expect(html.length).toBeGreaterThan(1000);
    if (ds.incidents.length === 0) expect(html).toContain("Chưa có dữ liệu nền nếp");
    if (!ds.config.rag.approved) expect(html).toContain("Ngưỡng cảnh báo chưa được phê duyệt");
  });
});

describe("kpi row", () => {
  it("renders 6 tiles", () => {
    const spark: Record<KpiId, number[]> = { incidents: [1, 2], turns: [1, 3], students: [1, 2], penalty: [1, 2], reward: [0, 1], confidence: [100, 90] };
    const views = buildKpiViews({
      current: { incidents: 3, violationTurns: 4, relatedStudents: 4, uniqueStudents: 3, penaltyPoints: 8, rewardPoints: 5, classesWithIncidents: 2, confidence: 0.9, reviewCount: 1, unnamedStudentCount: 1 },
      mode: "week",
      classTotal: 8,
      minConfidence: 0.8,
      pendingReward: { points: 0, count: 0 },
      countedStatuses: ["Đã xác nhận"],
      spark,
    });
    const html = render(KpiRow, { views });
    expect(html).toContain("Độ tin cậy dữ liệu");
    expect(html).toContain("Lượt vi phạm");
    expect(html).toContain("Số HS vi phạm");
    expect(html).toContain("2/8 lớp phát sinh");
    expect(html).toContain("+ 1 HS chưa rõ tên");
  });
});

describe("school cards", () => {
  it("render with two levels", () => {
    const a = makeFixtureDataset();
    const b: LevelDataset = { ...makeFixtureDataset(), levelId: "TH" };
    const sa = levelSummary(a, "week", FIXTURE_TODAY);
    const sb = levelSummary(b, "all", FIXTURE_TODAY);
    const trend = mergeWeeklyTrends(
      [
        { levelId: "THCS", trend: levelTrend(a, FIXTURE_TODAY), classCount: 8 },
        { levelId: "TH", trend: levelTrend(b, FIXTURE_TODAY), classCount: 8 },
      ],
      "perClass",
    );
    const html = [
      render(LevelCard, { summary: sa, minConfidence: 0.8, onOpen: noop }),
      render(CompareCard, { summaries: [sa, sb] }),
      render(SchoolTrendCard, { trend: () => trend }),
      render(SchoolIssuesCard, { issues: [] }),
      render(SchoolAlertsCard, { summaries: [sa, sb], onOpenLevel: noop }),
    ].join("");
    expect(html).toContain("Trung học cơ sở");
    expect(html).toContain("Cảnh báo theo cấp học");
  });
});

describe("THPT cards (one level-wide ranking)", () => {
  it("name the rank toàn cấp, the lượt vi phạm and the Top 3; per-khối filters still apply", () => {
    const ds: LevelDataset = { ...makeFixtureDataset(), levelId: "THPT" };
    const filters: GlobalFilters = { period: { mode: "month", key: "2026-10" }, grade: 7 };
    const ranking = buildRanking(ds, filters.period, FIXTURE_TODAY);
    const mine = ranking.grades.flatMap((g) => g.rows).filter((r) => r.classCode === "6A03");
    const html = [
      render(MyClassCard, { levelId: ds.levelId, rows: mine, periodText: "Tháng 10/2026", onOpenClass: noop }),
      render(PriorityClassesCard, { ds, classes: classStats(ds, { ...filters, grade: undefined }), ranking, onOpenClass: noop }),
      render(RagCard, { ds, ranking, grade: filters.grade, onOpenClass: noop }),
      render(GradeCard, { ds, filters: { period: filters.period }, today: FIXTURE_TODAY, onPickGrade: noop }),
      render(LevelCard, { summary: levelSummary(ds, "month", FIXTURE_TODAY), minConfidence: 0.8, onOpen: noop }),
    ].join("");
    expect(html).toContain("Hạng " + mine[0].rank + "/8 toàn cấp");
    expect(html).not.toMatch(/Hạng \d+\/\d+ khối/);
    expect(html).toContain("Lượt vi phạm");
    expect(html).toContain("Khối 7 · 3 lớp");
    expect(html).toContain("Số lớp thuộc Top 90% toàn cấp");
    expect(html).toContain("Top 3 toàn cấp:");
    expect(html).not.toContain("Dẫn đầu:");
  });

  it("TH/THCS keep the khối wording", () => {
    const ds = makeFixtureDataset();
    const ranking = buildRanking(ds, { mode: "month", key: "2026-10" }, FIXTURE_TODAY);
    const rows = ranking.grades.flatMap((g) => g.rows).filter((r) => r.classCode === "6A03");
    const html = [
      render(MyClassCard, { levelId: ds.levelId, rows, periodText: "Tháng 10/2026", onOpenClass: noop }),
      render(LevelCard, { summary: levelSummary(ds, "month", FIXTURE_TODAY), minConfidence: 0.8, onOpen: noop }),
    ].join("");
    expect(html).toMatch(/Hạng \d+\/5 khối 6/);
    expect(html).not.toContain("Lượt vi phạm");
    expect(html).toContain("Dẫn đầu:");
  });
});

describe("cross-filter cards (UX-10)", () => {
  it("Top 5 keeps the other errors next to the selected one", () => {
    const ds = makeFixtureDataset();
    const scope: GlobalFilters = { period: { mode: "month", key: "2026-10" } }; // what the screen passes: filters without the error
    const html = render(TopIssuesCard, { ds, incidents: filterIncidents(ds, scope), errorCode: "L05", onPick: noop });
    expect(html).toContain("Bỏ lọc lỗi Làm mất trật tự");
    expect((html.match(/aria-label="Lọc theo lỗi/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
