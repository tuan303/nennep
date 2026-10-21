/**
 * Server-render smoke tests of the ranking components with the fixture dataset (node environment, no DOM):
 * they must render without throwing and show the key texts (medals, divider, breakdown, highlight).
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildRanking, previousPeriod } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { Period } from "@/lib/types";
import { ClassBreakdown } from "../class-breakdown";
import { classDetailHref, rankDeltas, top90DividerIndex } from "../lib/ranking-view";
import { RankingCards } from "../ranking-cards";
import { RankingExplainer } from "../ranking-explainer";
import { RankingTable } from "../ranking-table";

// vitest's esbuild compiles TSX with the classic runtime (tsconfig keeps `jsx: preserve` for Next): expose React globally.
(globalThis as { React?: typeof React }).React = React;

const OCTOBER: Period = { mode: "month", key: "2026-10" };

function setup(ratio = 0.6) {
  const ds = makeFixtureDataset();
  ds.config.top90Ratio = ratio;
  const ranking = buildRanking(ds, OCTOBER, FIXTURE_TODAY, { highlightClass: "6A03" });
  const g6 = ranking.grades[0];
  return { ds, ranking, g6 };
}

describe("ranking components (SSR smoke)", () => {
  it("renders the table with the divider, the highlighted class and an expanded panel", () => {
    const { ds, ranking, g6 } = setup();
    const prev = previousPeriod(OCTOBER, ds.weeks, ds.config.semesters)!;
    const deltas = rankDeltas(ranking.grades, buildRanking(ds, prev, FIXTURE_TODAY).grades);
    const html = renderToStaticMarkup(
      createElement(RankingTable, {
        ds,
        grade: 6,
        rows: g6.rows,
        period: OCTOBER,
        dividerIndex: top90DividerIndex(g6.rows),
        trends: new Map([["6A03", [100, 90, 60, 70]]]),
        deltas,
        previousNoun: "tháng trước",
        expanded: "6A03",
        onToggle: () => {},
        detailHref: (code: string) => classDetailHref("mode=month&key=2026-10", code),
      }),
    );
    expect(html).toContain("Ngưỡng Top 90%: hạng ≤ 3".replace("90%", "60%"));
    expect(html).toContain("Đang lọc");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Điểm trừ theo lỗi");
    expect(html).toContain("/lop?mode=month&amp;key=2026-10&amp;class=6A03");
    expect(html).toContain("GVCN Lê Văn Hùng");
  });

  it("renders phone cards", () => {
    const { g6 } = setup();
    const html = renderToStaticMarkup(
      createElement(RankingCards, {
        grade: 6,
        rows: g6.rows,
        dividerIndex: top90DividerIndex(g6.rows),
        previousNoun: "tháng trước",
        ratio: 0.6,
        onOpen: () => {},
      }),
    );
    expect(html.match(/<button/g)?.length).toBe(g6.rows.length);
    expect(html).toContain('role="separator"');
  });

  it("renders the breakdown of a class with rewards", () => {
    const { ds, ranking } = setup(0.9);
    const row = ranking.grades[0].rows.find((r) => r.classCode === "6A01")!;
    const html = renderToStaticMarkup(createElement(ClassBreakdown, { ds, row, period: OCTOBER, detailHref: "/lop?class=6A01" }));
    expect(html).toContain("Lớp có tiến bộ rõ rệt");
    expect(html).toContain("Xem chi tiết lớp");
  });

  it("explains uncounted rewards with the configured statuses (UX-12)", () => {
    const { ds } = setup(0.9);
    ds.config.rewardCountedStatuses = ["Đang xác minh", "Đã xác nhận"];
    const ranking = buildRanking(ds, OCTOBER, FIXTURE_TODAY, {});
    const row = ranking.grades[0].rows.find((r) => r.classCode === "6A03")!; // "Mới ghi nhận" reward on 20/10
    const html = renderToStaticMarkup(createElement(ClassBreakdown, { ds, row, period: OCTOBER, detailHref: "/lop?class=6A03" }));
    expect(html).toContain("Khoản thưởng có nhãn trạng thái chưa được cộng vào điểm thi đua (chỉ tính trạng thái “Đang xác minh” hoặc “Đã xác nhận”).");
    expect(html).not.toContain("chưa xác nhận chưa được cộng");
  });

  it("renders the explanation strip (approved and not approved thresholds)", () => {
    const { ds } = setup(0.9);
    const html = renderToStaticMarkup(
      createElement(RankingExplainer, {
        config: ds.config,
        period: OCTOBER,
        countedWeeks: 3,
        inProgress: true,
        highlightClass: "6A03",
        issueFilterActive: true,
      }),
    );
    expect(html).toContain("Điểm nền = 100 × 3 tuần =");
    expect(html).toContain("tuần đang diễn ra");
    expect(html).toContain("mọi lỗi");
    ds.config.rag.approved = false;
    const gray = renderToStaticMarkup(
      createElement(RankingExplainer, { config: ds.config, period: OCTOBER, countedWeeks: 0, inProgress: false, issueFilterActive: false }),
    );
    expect(gray).toContain("chưa được phê duyệt");
    expect(gray).toContain("điểm nền bằng 0");
  });
});
