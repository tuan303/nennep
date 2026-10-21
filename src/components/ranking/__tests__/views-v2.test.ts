/**
 * REQ_V2 §6.3 Xếp hạng views: view switching, bump lines (Biến động), coverage table model (Bao phủ) + SSR smoke tests.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildBumpOption } from "@/components/charts/bump-option";
import { buildRanking, inspectionCoverage, rankHistory, type InspectionCoverage, type RankHistory } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import type { GlobalFilters } from "@/lib/types";
import { CoverageView } from "../coverage-view";
import { COVERAGE_STATUS_META, coverageDisplay, coverageIsEmpty, coverageKpis, coverageNote, coverageRatioText, coverageRowText, perRoundText } from "../lib/coverage-view";
import { bumpHeader, bumpLines, parseRankingView, rankMoves, rankingViewHref, RANKING_VIEWS, topMovers } from "../lib/movement-view";
import { GradeMovementCard, RankMovementView } from "../rank-movement-view";

const YEAR: GlobalFilters = { period: { mode: "all" } };

describe("view switching (?view=bang|bien-dong|bao-phu)", () => {
  it("parses the view param with 'bang' as default", () => {
    expect(parseRankingView(null)).toBe("bang");
    expect(parseRankingView("bien-dong")).toBe("bien-dong");
    expect(parseRankingView(" bao-phu ")).toBe("bao-phu");
    expect(parseRankingView("khac")).toBe("bang");
    expect(RANKING_VIEWS.map((v) => v.value)).toEqual(["bang", "bien-dong", "bao-phu"]);
  });

  it("builds view URLs keeping the global filters", () => {
    expect(rankingViewHref("/xep-hang", "mode=month&key=2026-10&class=6A03", "bien-dong")).toBe("/xep-hang?mode=month&key=2026-10&class=6A03&view=bien-dong");
    expect(rankingViewHref("/xep-hang", "view=bao-phu&grade=6", "bang")).toBe("/xep-hang?grade=6");
    expect(rankingViewHref("/xep-hang", "view=bien-dong", "bang")).toBe("/xep-hang");
  });
});

describe("Biến động xếp hạng (bump)", () => {
  const history: RankHistory = {
    grade: 6,
    basis: "cumulative",
    weeks: ["2026-10-05", "2026-10-12"],
    labels: ["05/10", "12/10"],
    classes: ["6A01", "6A02", "6A03", "6A04", "6A05", "6A06", "6A07"].map((code, i) => ({
      classCode: code,
      ranks: [i + 1, [3, 1, 2, 4, 7, 6, 5][i]],
      scores: [100 - i, 200 - i],
    })),
  };

  it("colours the top 5 by latest rank, highlights the filtered class and fades the others", () => {
    const lines = bumpLines(history, { highlight: "6A06" });
    const by = Object.fromEntries(lines.map((l) => [l.name, l.emphasis]));
    // Latest ranks: 6A02 1, 6A03 2, 6A01 3, 6A04 4, 6A07 5 → top; 6A06 highlighted; 6A05 faded.
    expect(by).toEqual({ "6A01": "top", "6A02": "top", "6A03": "top", "6A04": "top", "6A05": "faded", "6A06": "highlight", "6A07": "top" });
    expect(bumpLines(history, { top: 2 }).filter((l) => l.emphasis === "top").map((l) => l.name)).toEqual(["6A02", "6A03"]);
    expect(lines[0].scores).toEqual([100, 200]);
  });

  it("reports the biggest risers / fallers between the first and last point", () => {
    expect(rankMoves(history).map((m) => [m.classCode, m.change])).toEqual([
      ["6A07", 2],
      ["6A02", 1],
      ["6A03", 1],
      ["6A04", 0],
      ["6A06", 0],
      ["6A01", -2],
      ["6A05", -2],
    ]);
    const { up, down } = topMovers(history);
    expect(up).toEqual({ classCode: "6A07", first: 7, last: 5, change: 2 });
    expect(down).toEqual({ classCode: "6A01", first: 1, last: 3, change: -2 });
    expect(topMovers({ ...history, classes: history.classes.map((c) => ({ ...c, ranks: [1, 1] })) })).toEqual({ up: undefined, down: undefined });
  });

  it("feeds the kit bump option (inverted 1…N axis, crimson highlight)", () => {
    const ds = makeFixtureDataset();
    const h = rankHistory(ds, 6, FIXTURE_TODAY, { period: { mode: "month", key: "2026-10" } });
    const lines = bumpLines(h, { highlight: "6A03" });
    const option = buildBumpOption({ categories: h.labels, lines, total: h.classes.length, headerOf: (i) => bumpHeader("cumulative", h.labels[i]) }) as {
      yAxis: { inverse: boolean; max: number };
      series: Array<{ name: string }>;
    };
    expect(option.yAxis).toMatchObject({ inverse: true, max: h.classes.length });
    expect(option.series.map((s) => s.name).sort()).toEqual(h.classes.map((c) => c.classCode).sort());
    // Last cumulative point = the ranking of the period.
    const ranking = buildRanking(ds, { mode: "month", key: "2026-10" }, FIXTURE_TODAY);
    const row = ranking.grades.find((g) => g.grade === 6)!.rows.find((r) => r.classCode === "6A03")!;
    const c = h.classes.find((x) => x.classCode === "6A03")!;
    expect(c.ranks[c.ranks.length - 1]).toBe(row.rank);
    expect(bumpHeader("week", "12/10")).toBe("Tuần 12/10");
    expect(bumpHeader("cumulative", "12/10")).toBe("Đến tuần 12/10");
  });

  it("renders the view and an empty grade (no counted week)", () => {
    const ds = makeFixtureDataset();
    const html = renderToStaticMarkup(
      createElement(RankMovementView, { ds, filters: { period: { mode: "month", key: "2026-10" }, classCode: "6A03" }, today: FIXTURE_TODAY, grades: [6, 7] }),
    );
    expect(html).toContain("Khối 6");
    expect(html).toContain("Khối 7");
    expect(html).toContain("Hiện các lớp khác");
    const empty = renderToStaticMarkup(
      createElement(GradeMovementCard, { ds, grade: 6, basis: "week", filters: { period: { mode: "week", key: "2026-08-31" } }, today: "2026-08-10", showOthers: true }),
    );
    expect(empty).toContain("Chưa có tuần nào được tính thi đua");
  });
});

describe("Bao phủ kiểm tra", () => {
  it("labels statuses with text + tone (colour never alone)", () => {
    expect(COVERAGE_STATUS_META.OK).toEqual({ label: "Đạt", tone: "ok" });
    expect(COVERAGE_STATUS_META.LOW).toEqual({ label: "Ít được kiểm tra", tone: "warn" });
    expect(COVERAGE_STATUS_META.NONE).toEqual({ label: "Chưa được kiểm tra", tone: "bad" });
    expect(coverageNote(0.6)).toBe("Lớp có số đợt kiểm tra dưới 60% trung bình của khối được đánh dấu để bảo đảm công bằng khi so sánh điểm trừ.");
    expect(coverageRatioText(null)).toBe("–");
    expect(coverageRatioText(0.23)).toBe("23%");
    expect(perRoundText(null)).toBe("–");
    expect(perRoundText(1.5)).toBe("1,5");
  });

  it("never shows “Đạt” for a class without any round (whole grade uninspected)", () => {
    expect(coverageDisplay({ status: "OK", rounds: 0 })).toEqual({ label: "Chưa được kiểm tra", tone: "muted", icon: "NONE" });
    expect(coverageDisplay({ status: "OK", rounds: 2 })).toEqual({ label: "Đạt", tone: "ok", icon: "OK" });
    expect(coverageDisplay({ status: "NONE", rounds: 0 })).toEqual({ label: "Chưa được kiểm tra", tone: "bad", icon: "NONE" });
  });

  it("builds the KPIs and flags the v2 fixture classes (6A05 never, 7A03 rarely inspected)", () => {
    const ds = makeV2FixtureDataset();
    const cov = inspectionCoverage(ds, YEAR, FIXTURE_TODAY);
    const kpis = Object.fromEntries(coverageKpis(cov).map((k) => [k.id, k]));
    expect(kpis.rounds.value).toBe(String(cov.rounds));
    expect(kpis.classes.value).toBe(`${cov.classesInspected}/${cov.classesTotal}`);
    expect(kpis.flagged.value).toBe(String(cov.flagged.length));
    expect(kpis.flagged.tone).toBe("bad");
    expect(cov.flagged.map((r) => [r.classCode, r.status])).toEqual(expect.arrayContaining([["6A05", "NONE"], ["7A03", "LOW"]]));
    const none = cov.flagged.find((r) => r.classCode === "6A05")!;
    expect(coverageRowText(none)).toContain("Chưa được kiểm tra");
    expect(coverageIsEmpty(cov)).toBe(false);
  });

  it("renders the per-grade tables, the note and the empty state", () => {
    const ds = makeV2FixtureDataset();
    const html = renderToStaticMarkup(
      createElement(CoverageView, { ds, filters: { ...YEAR, classCode: "6A05" }, today: FIXTURE_TODAY, canManage: true, detailHref: (c: string) => `/lop?class=${c}` }),
    );
    // Class filter → that class's grade only (population unchanged), the class highlighted.
    for (const text of ["Đợt kiểm tra", "Số buổi", "Lớp được kiểm tra", "Lớp chưa công bằng", "So với TB khối", "Chưa được kiểm tra", "Khối 6", "Đang lọc"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Khối 7");
    expect(html).toContain("dưới 60% trung bình của khối");
    const all = renderToStaticMarkup(
      createElement(CoverageView, { ds, filters: { ...YEAR, studentId: "X" }, today: FIXTURE_TODAY, canManage: false, detailHref: (c: string) => c }),
    );
    expect(all).toContain("Khối 7");
    expect(all).toContain("Ít được kiểm tra");
    expect(all).toContain("không áp dụng cho đợt kiểm tra");
    const empty = renderToStaticMarkup(
      createElement(CoverageView, { ds: makeFixtureDataset(), filters: YEAR, today: FIXTURE_TODAY, canManage: true, detailHref: (c: string) => c }),
    );
    expect(empty).toContain("Chưa ghi nhận đợt kiểm tra nào");
    expect(empty).toContain("/nhap-lieu?tab=kiem-tra");
    const viewer = renderToStaticMarkup(
      createElement(CoverageView, { ds: makeFixtureDataset(), filters: YEAR, today: FIXTURE_TODAY, canManage: false, detailHref: (c: string) => c }),
    );
    expect(viewer).not.toContain("/nhap-lieu?tab=kiem-tra");
    // Rounds exist, but none in the selected period → the title must not claim that nothing was ever recorded.
    const otherPeriod = renderToStaticMarkup(
      createElement(CoverageView, { ds, filters: { period: { mode: "week", key: "2026-08-31" } }, today: FIXTURE_TODAY, canManage: false, detailHref: (c: string) => c }),
    );
    expect(otherPeriod).toContain("Chưa có đợt kiểm tra trong kỳ / phạm vi đang lọc");
  });

  it("treats a dataset without inspections as empty", () => {
    const ds = makeFixtureDataset();
    delete ds.inspections;
    const cov: InspectionCoverage = inspectionCoverage(ds, YEAR, FIXTURE_TODAY);
    expect(coverageIsEmpty(cov)).toBe(true);
  });
});
