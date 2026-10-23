/**
 * THPT ranking rule on the Xếp hạng screen: one "Toàn cấp" table (not per khối), equal scores ordered by fewer lượt vi
 * phạm, equal on both → same rank, reports name the top 3. View models + SSR smoke tests (TH / THCS unchanged).
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LEVEL_RANKING_GROUP, buildRanking, rankingRuleOf } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { TODAY, makeClass, makeDataset, makeIncident, makeReward } from "@/lib/engine/__tests__/builders";
import type { LevelDataset, Period, StudentRef } from "@/lib/types";
import { ClassBreakdown } from "../class-breakdown";
import { GradeSection, type GradeSectionProps } from "../grade-section";
import { movementLegendText, rankingViewDescription } from "../lib/movement-view";
import {
  gradeSummary,
  rankDeltas,
  rankingFileName,
  rankingGroupAnchor,
  rankingLeaders,
  rankingPopulationText,
  rankingRuleNote,
  top90DividerIndex,
} from "../lib/ranking-view";
import { RankMovementView } from "../rank-movement-view";
import { RankingCards } from "../ranking-cards";
import { RankingExplainer } from "../ranking-explainer";
import { RankingTable } from "../ranking-table";

// vitest's esbuild compiles TSX with the classic runtime (tsconfig keeps `jsx: preserve` for Next): expose React globally.
(globalThis as { React?: typeof React }).React = React;

const WEEK: Period = { mode: "week", key: "2026-10-19" };
const OCTOBER: Period = { mode: "month", key: "2026-10" };
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

function sectionProps(ds: LevelDataset, period: Period, today: string, cards: boolean): GradeSectionProps {
  const ranking = buildRanking(ds, period, today).grades[0];
  return {
    ds,
    ranking,
    period,
    trends: new Map(),
    previousNoun: "tuần trước",
    cards,
    expanded: null,
    onToggle: () => {},
    onOpenSheet: () => {},
    detailHref: (code: string) => `/lop?class=${code}`,
    highlightRef: () => {},
  };
}

describe("THPT view models", () => {
  it("names and anchors the level-wide table", () => {
    expect(rankingGroupAnchor(LEVEL_RANKING_GROUP)).toBe("toan-cap");
    expect(rankingGroupAnchor(6)).toBe("khoi-6");
    expect(rankingPopulationText(rankingRuleOf("THPT"))).toBe("các lớp của cấp học");
    expect(rankingPopulationText(rankingRuleOf("THCS"))).toBe("các lớp của khối");
  });

  it("explains the THPT rule; TH / THCS have no extra note", () => {
    expect(rankingRuleNote(rankingRuleOf("THCS"), "THCS")).toBeUndefined();
    expect(rankingRuleNote(rankingRuleOf("TH"), "Tiểu học")).toBeUndefined();
    const note = rankingRuleNote(rankingRuleOf("THPT"), "THPT")!;
    expect(note).toContain("Cấp THPT xếp hạng chung tất cả các lớp, không chia theo khối.");
    expect(note).toContain("lớp có ít lượt vi phạm hơn xếp trên");
    expect(note).toContain("thì đồng hạng");
    expect(note).toContain("3 lớp dẫn đầu toàn cấp");
    expect(rankingRuleNote({ ...rankingRuleOf("THPT"), topCount: undefined }, "THPT")).not.toContain("dẫn đầu");
  });

  it("describes the views with “toàn cấp” for THPT", () => {
    expect(rankingViewDescription("bang", "level")).toMatch(/^Bảng xếp hạng toàn cấp:/);
    expect(rankingViewDescription("bang", "grade")).toMatch(/^Bảng xếp hạng theo khối:/);
    expect(rankingViewDescription("bien-dong", "level")).toContain("từng lớp toàn cấp");
    expect(rankingViewDescription("bien-dong", "grade")).toContain("từng lớp trong khối");
    // Coverage is not a ranking: still compared with the khối average.
    expect(rankingViewDescription("bao-phu", "level")).toBe(rankingViewDescription("bao-phu", "grade"));
  });

  it("lists the top 3 with every class tied at the cut, and nothing when the tie covers the table", () => {
    const rows = buildRanking(thpt(), WEEK, TODAY).grades[0].rows;
    expect(rankingLeaders(rows, rankingRuleOf("THPT")).map((r) => [r.classCode, r.rank])).toEqual([
      ["10A1", 1],
      ["11A1", 1],
      ["12A1", 3],
    ]);
    expect(rankingLeaders(rows, rankingRuleOf("THCS"))).toEqual([]);
    // No incident yet: every class 100 points, 0 lượt → all rank 1, nobody stands out.
    const quiet = buildRanking({ ...thpt(), incidents: [], rewards: [] }, WEEK, TODAY).grades[0].rows;
    expect(quiet.every((r) => r.rank === 1)).toBe(true);
    expect(rankingLeaders(quiet, rankingRuleOf("THPT"))).toEqual([]);
  });

  it("summarises the single table over the whole level (Top 90% included)", () => {
    const ds = { ...makeFixtureDataset(), levelId: "THPT" as const };
    const ranking = buildRanking(ds, OCTOBER, FIXTURE_TODAY, { grade: 7 });
    expect(ranking.grades).toHaveLength(1);
    const s = gradeSummary(ranking.grades[0]);
    expect(s).toMatchObject({ grade: LEVEL_RANKING_GROUP, classCount: ds.classes.filter((c) => c.active).length });
    expect(s.cutoff).toBe(Math.ceil(0.9 * s.classCount));
    ds.config.top90Ratio = 0.5;
    const rows = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades[0].rows;
    const idx = top90DividerIndex(rows);
    expect(idx).toBeGreaterThan(0);
    expect(rows[idx - 1].inTop90).toBe(true);
    expect(rows[idx].inTop90).toBe(false);
  });

  it("compares level-wide ranks with the previous period", () => {
    const ds = { ...makeFixtureDataset(), levelId: "THPT" as const };
    const now = buildRanking(ds, OCTOBER, FIXTURE_TODAY).grades;
    const before = buildRanking(ds, { mode: "month", key: "2026-09" }, FIXTURE_TODAY).grades;
    const deltas = rankDeltas(now, before);
    expect(deltas.size).toBe(now[0].rows.length);
    for (const r of now[0].rows) expect(deltas.get(r.classCode)).toBe(before[0].rows.find((x) => x.classCode === r.classCode)!.rank - r.rank);
  });

  it("names the export without a khối (the whole level is exported)", () => {
    expect(rankingFileName("THPT", "Tháng 10/2026", undefined)).toBe("NSHM_Xep-hang_THPT_Tháng 10-2026.xlsx");
  });

  it("words the movement legend after the “Hiện các lớp khác” switch", () => {
    expect(movementLegendText({ showOthers: true })).toBe("5 lớp dẫn đầu có màu riêng, các lớp khác được làm mờ (bấm tên lớp ở chú thích để ẩn/hiện).");
    expect(movementLegendText({ highlight: "12A2", showOthers: false })).toBe(
      "Đường đỏ đậm là lớp 12A2 đang lọc; 5 lớp dẫn đầu có màu riêng, các lớp khác đang ẩn (bật “Hiện các lớp khác” hoặc bấm tên lớp ở chú thích để hiện).",
    );
  });
});

describe("THPT ranking components (SSR smoke)", () => {
  it("renders one “Toàn cấp” section with the top 3 and the Lượt vi phạm column", () => {
    const html = renderToStaticMarkup(createElement(GradeSection, sectionProps(thpt(), WEEK, TODAY, false)));
    expect(html).toContain('id="toan-cap"');
    expect(html).toContain("Toàn cấp");
    expect(html).not.toContain("Khối 0");
    expect(html).toContain("Top 3 toàn cấp");
    expect(html).toContain("Bảng xếp hạng thi đua toàn cấp");
    expect(html).toContain("Lượt vi phạm");
    expect(html).toContain("0 lượt vi phạm"); // leader chips explain 1, 1, 3
    expect(html).toContain("1 lượt vi phạm");
    // Classes of every khối in the same table, in rank order.
    const order = ["10A1", "11A1", "12A1", "12A2", "10A2"].map((c) => html.indexOf(`>${c}<`));
    expect(order.every((pos, i) => pos > 0 && (i === 0 || pos > order[i - 1]))).toBe(true);
  });

  it("keeps THCS sections per khối without the Lượt vi phạm column or a top strip", () => {
    const ds = makeFixtureDataset();
    const html = renderToStaticMarkup(createElement(GradeSection, sectionProps(ds, OCTOBER, FIXTURE_TODAY, false)));
    expect(html).toContain('id="khoi-6"');
    expect(html).toContain("Khối 6");
    expect(html).not.toContain("Lượt vi phạm");
    expect(html).not.toContain("Top 3");
  });

  it("shows lượt vi phạm on phone cards", () => {
    const ds = thpt();
    const g = buildRanking(ds, WEEK, TODAY).grades[0];
    const html = renderToStaticMarkup(
      createElement(RankingCards, { grade: g.grade, rows: g.rows, showTurns: true, dividerIndex: -1, previousNoun: "tuần trước", ratio: 0.9, onOpen: () => {} }),
    );
    expect(html).toContain('aria-label="Bảng xếp hạng toàn cấp"');
    expect(html).toContain("Lớp 10A2, hạng 5, 96 điểm thi đua, 2 lượt vi phạm. Xem phân tích");
    const plain = renderToStaticMarkup(
      createElement(RankingCards, { grade: g.grade, rows: g.rows, dividerIndex: -1, previousNoun: "tuần trước", ratio: 0.9, onOpen: () => {} }),
    );
    expect(plain).not.toContain("lượt vi phạm");
  });

  it("renders the table on its own (caption, tie-break column)", () => {
    const ds = thpt();
    const g = buildRanking(ds, WEEK, TODAY).grades[0];
    const html = renderToStaticMarkup(
      createElement(RankingTable, {
        ds,
        grade: g.grade,
        rows: g.rows,
        period: WEEK,
        dividerIndex: -1,
        trends: new Map(),
        previousNoun: "tuần trước",
        expanded: "12A2",
        onToggle: () => {},
        detailHref: (code: string) => `/lop?class=${code}`,
      }),
    );
    expect(html).toContain("Bảng xếp hạng thi đua toàn cấp");
    expect(html).toContain("Lượt vi phạm");
    expect(html).toContain("Hạng toàn cấp"); // expanded breakdown
  });

  it("explains the rule, the population and the ignored grade filter", () => {
    const ds = thpt();
    const html = renderToStaticMarkup(
      createElement(RankingExplainer, {
        config: ds.config,
        levelId: "THPT",
        gradeFilter: 11,
        period: WEEK,
        countedWeeks: 1,
        inProgress: true,
        highlightClass: "12A2",
        issueFilterActive: false,
      }),
    );
    expect(html).toContain("Cấp THPT xếp hạng chung tất cả các lớp");
    expect(html).toContain("thứ hạng vẫn tính trên toàn bộ các lớp của cấp học.");
    expect(html).toContain("Bộ lọc Khối 11 không thu hẹp bảng xếp hạng");
    expect(html).toContain("số lớp toàn cấp");
    const thcs = renderToStaticMarkup(
      createElement(RankingExplainer, {
        config: ds.config,
        levelId: "THCS",
        gradeFilter: 6,
        period: WEEK,
        countedWeeks: 1,
        inProgress: false,
        highlightClass: "6A03",
        issueFilterActive: false,
      }),
    );
    expect(thcs).not.toContain("xếp hạng chung");
    expect(thcs).not.toContain("không thu hẹp");
    expect(thcs).toContain("thứ hạng vẫn tính trên toàn bộ các lớp của khối.");
    expect(thcs).toContain("số lớp của khối");
  });

  it("adds lượt vi phạm and the level rank to the class breakdown", () => {
    const ds = thpt();
    const row = buildRanking(ds, WEEK, TODAY).grades[0].rows.find((r) => r.classCode === "12A1")!;
    const html = renderToStaticMarkup(createElement(ClassBreakdown, { ds, row, period: WEEK, detailHref: "/lop?class=12A1" }));
    expect(html).toContain("Lượt vi phạm");
    expect(html).toContain("Hạng toàn cấp");
    expect(html).toContain("3/5");
  });

  it("draws one “Toàn cấp” movement chart with the other classes hidden by default", () => {
    const ds = thpt();
    const html = renderToStaticMarkup(
      createElement(RankMovementView, { ds, filters: { period: WEEK, grade: 10 }, today: TODAY, grades: [LEVEL_RANKING_GROUP] }),
    );
    expect(html).toContain('id="toan-cap"');
    expect(html).toContain("Toàn cấp");
    expect(html).not.toContain("Khối 0");
    expect(html).toContain("5 lớp");
    expect(html).toContain("các lớp khác đang ẩn");
    expect(html).toContain("ít lượt vi phạm hơn xếp trên");
    expect(html).not.toContain("dẫn đầu toàn cấp");
    expect(html).toContain("Bộ lọc Khối 10 không thu hẹp xếp hạng toàn cấp.");
    expect(html).not.toContain("Chuyển nhanh đến khối");
  });
});
