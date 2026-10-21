/**
 * Server-render smoke tests of the "Khối & lớp" components with the fixture dataset (node environment, no DOM),
 * including a GVCN-redacted view of another class.
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildRanking, classTimeline, computeKpis, findRankingRow, studentStats, topIssues, filterIncidents } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { Incident, LevelDataset, Period } from "@/lib/types";
import { ClassHeaderCard } from "../class-header-card";
import { ClassKpis } from "../class-kpis";
import { ClassOverview } from "../class-overview";
import { ClassStudents } from "../class-students";
import { ClassTimeline } from "../class-timeline";
import { ClassTopIssues } from "../class-top-issues";
import { classSize } from "../lib/class-view";

// vitest's esbuild compiles TSX with the classic runtime (tsconfig keeps `jsx: preserve` for Next): expose React globally.
(globalThis as { React?: typeof React }).React = React;

const OCTOBER: Period = { mode: "month", key: "2026-10" };
const noop = () => {};

/** Same stripping as the server (redactIncident) for incidents of other classes. */
function redact(ds: LevelDataset, visibleClass: string): LevelDataset {
  const strip = (i: Incident): Incident => {
    const { detail: _d, gvcnNote: _n, gvcnNoteBy: _b, gvcnNoteAt: _a, reporter: _r, ...rest } = i;
    return { ...rest, students: [], evidenceUrls: [], photoIds: [] };
  };
  return {
    ...ds,
    students: ds.students.filter((s) => s.classCode === visibleClass),
    incidents: ds.incidents.map((i) => (i.classCode === visibleClass ? i : strip(i))),
    redacted: true,
  };
}

describe("class-detail components (SSR smoke)", () => {
  it("renders the header card with rank, badges, contacts and size", () => {
    const ds = makeFixtureDataset();
    const cls = { ...ds.classes.find((c) => c.code === "6A03")!, deputyTeacher: "Ngô Thị Thảo", homeroomPhone: "0912 345 678" };
    const row = findRankingRow(buildRanking(ds, OCTOBER, FIXTURE_TODAY, { grade: 6 }), "6A03");
    const html = renderToStaticMarkup(
      createElement(ClassHeaderCard, {
        cls,
        row,
        previousRank: 2,
        previousNoun: "tháng trước",
        size: classSize(ds, cls, true),
        period: OCTOBER,
        config: ds.config,
        hidden: false,
        own: true,
      }),
    );
    expect(html).toContain("Lê Văn Hùng");
    expect(html).toContain("Phó CN");
    expect(html).toContain("tel:0912345678");
    expect(html).toContain(`/${row!.gradeClassCount}`);
    expect(html).toContain("Tháng trước: hạng 2");
    expect(html).toContain("Lớp chủ nhiệm");
  });

  it("renders the timeline with student chips, unnamed students and collective incidents", () => {
    const ds = makeFixtureDataset();
    const html = renderToStaticMarkup(
      createElement(ClassTimeline, {
        days: classTimeline(ds, "6A03", OCTOBER),
        hidden: false,
        filtered: false,
        periodText: "Tháng 10/2026",
        onOpenIncident: noop,
        onOpenStudent: noop,
      }),
    );
    expect(html).toContain("Phạm Thiện Khôi");
    expect(html).toContain("HS chưa rõ tên");
    expect(html).toContain("Tập thể lớp");
    expect(html).toContain("Xem thêm");
    expect(html).toContain("Có phản hồi GVCN");
  });

  it("renders a GVCN view of another class without names", () => {
    const ds = redact(makeFixtureDataset(), "7A01");
    const days = classTimeline(ds, "6A03", OCTOBER);
    const html = renderToStaticMarkup(
      createElement(ClassTimeline, { days, hidden: true, filtered: false, periodText: "Tháng 10/2026", onOpenIncident: noop, onOpenStudent: noop }),
    );
    expect(html).not.toContain("Phạm Thiện Khôi");
    expect(html).toContain("(ẩn danh)");
    expect(html).not.toContain("Người ghi");

    const students = renderToStaticMarkup(
      createElement(ClassStudents, {
        classCode: "6A03",
        students: [],
        config: ds.config,
        hidden: true,
        relatedStudents: computeKpis(ds, { period: OCTOBER, classCode: "6A03" }).relatedStudents,
        onOpenStudent: noop,
      }),
    );
    expect(students).toContain("Danh sách học sinh được ẩn");
    const cls = ds.classes.find((c) => c.code === "6A03")!;
    expect(classSize(ds, cls, false).source).toBe("source");
  });

  it("renders the friendly empty timeline", () => {
    const html = renderToStaticMarkup(
      createElement(ClassTimeline, {
        days: [],
        hidden: false,
        filtered: false,
        periodText: "Tuần 05/10 – 11/10/2026",
        onOpenIncident: noop,
        onOpenStudent: noop,
      }),
    );
    expect(html).toContain("Chưa có sự việc trong kỳ này");
  });

  it("renders students, frequent errors, KPIs and the overview tiles", () => {
    const ds = makeFixtureDataset();
    const scope = { period: OCTOBER, classCode: "6A03" };
    const students = renderToStaticMarkup(
      createElement(ClassStudents, {
        classCode: "6A03",
        students: studentStats(ds, scope, FIXTURE_TODAY),
        config: ds.config,
        hidden: false,
        relatedStudents: 0,
        onOpenStudent: noop,
      }),
    );
    expect(students).toContain("Phạm Thiện Khôi");
    expect(students).toContain("Cảnh báo đỏ");

    const issues = renderToStaticMarkup(createElement(ClassTopIssues, { issues: topIssues(filterIncidents(ds, scope), Infinity) }));
    expect(issues).toContain("L01");

    const row = findRankingRow(buildRanking(ds, OCTOBER, FIXTURE_TODAY, { grade: 6 }), "6A03");
    const kpis = renderToStaticMarkup(
      createElement(ClassKpis, {
        current: computeKpis(ds, scope),
        previous: computeKpis(ds, { ...scope, period: { mode: "month", key: "2026-09" } }),
        previousNoun: "tháng trước",
        row,
        trend: [],
        scores: [100, 80, 60],
        config: ds.config,
        hidden: false,
      }),
    );
    expect(kpis).toContain("Điểm thi đua");
    expect(kpis).toContain("so với tháng trước");
    expect(kpis).toContain("Điểm nền + Điểm thưởng (trạng thái “Đã xác nhận”) − Điểm trừ");

    // UX-12: the hints follow the counted reward statuses of the level.
    const custom = renderToStaticMarkup(
      createElement(ClassKpis, {
        current: computeKpis(ds, scope),
        previousNoun: "",
        row,
        trend: [],
        scores: [],
        config: { ...ds.config, rewardCountedStatuses: ["Đang xác minh", "Đã xác nhận"] },
        hidden: false,
      }),
    );
    expect(custom).toContain("Chỉ tính điểm thưởng ở trạng thái “Đang xác minh” hoặc “Đã xác nhận”.");
    expect(custom).toContain("Điểm thưởng (trạng thái “Đang xác minh” hoặc “Đã xác nhận”)");
    expect(custom).not.toContain("(đã xác nhận)");

    const overview = renderToStaticMarkup(
      createElement(ClassOverview, { ds, period: OCTOBER, today: FIXTURE_TODAY, ownCodes: new Set(["7A01"]), onPick: noop }),
    );
    expect(overview).toContain("Khối 6");
    expect(overview).toContain("Khối 7");
    expect(overview).toContain("Lớp của tôi");
    expect(overview).not.toContain("7A04"); // inactive class is not ranked
  });
});
