/** REQ_V2 §6.1 / §6.4 Khối & lớp: scope with group / student filters, timeline filtering, lớp vs TB khối. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_PERIOD, classTimeline, computeKpis, cumulativePenalty, filterIncidents } from "@/lib/engine";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { GlobalFilters, Period } from "@/lib/types";
import { ClassCumulativeCard } from "../class-cumulative";
import { ClassKpis } from "../class-kpis";
import { classScope, classVsGrade, classVsGradeText, filterTimelineDays, issueFilterText, timelineTotals } from "../lib/class-view";

const OCTOBER: Period = { mode: "month", key: "2026-10" };

describe("class scope (filters rebuilt by hand carry group and student)", () => {
  it("keeps the period, the class and every incident filter", () => {
    const f: GlobalFilters = { period: OCTOBER, grade: 6, classCode: "6A01", category: "C", errorCode: "L01", group: "Nhóm 1", studentId: "HS1" };
    expect(classScope(f, "6A03")).toEqual({ period: OCTOBER, classCode: "6A03", category: "C", errorCode: "L01", group: "Nhóm 1", studentId: "HS1" });
    expect(classScope({ period: OCTOBER }, "6A03")).toEqual({ period: OCTOBER, classCode: "6A03" });
  });

  it("describes the active incident filters", () => {
    expect(issueFilterText({})).toBeUndefined();
    expect(issueFilterText({ category: "Vệ sinh", group: "Nhóm 2", errorCode: "L04", studentId: "HS1" }, "Nguyễn Văn A")).toBe(
      "mảng “Vệ sinh”, nhóm lỗi “Nhóm 2”, lỗi L04, học sinh Nguyễn Văn A",
    );
    expect(issueFilterText({ studentId: "HS1" })).toBe("học sinh HS1");
  });

  it("filters the timeline by group and student like the engine filters", () => {
    const ds = makeFixtureDataset();
    const days = classTimeline(ds, "6A03", OCTOBER);
    const group = ds.incidents.find((i) => i.classCode === "6A03" && i.group)?.group;
    expect(group).toBeDefined();
    const byGroup = filterTimelineDays(days, { group });
    const inc = filterIncidents(ds, { period: OCTOBER, classCode: "6A03", group });
    expect(timelineTotals(byGroup)).toMatchObject({ incidents: inc.length, points: inc.reduce((a, i) => a + i.points, 0) });
    const student = FIXTURE_STUDENT_IDS.khoi;
    const byStudent = filterTimelineDays(days, { studentId: student });
    const named = filterIncidents(ds, { period: OCTOBER, classCode: "6A03", studentId: student });
    expect(timelineTotals(byStudent).incidents).toBe(named.length);
    expect(byStudent.every((d) => d.items.every((i) => i.students.some((s) => s.id === student)))).toBe(true);
  });
});

describe("lớp vs TB khối", () => {
  it("reads the last class / grade-average values of the engine series", () => {
    const ds = makeFixtureDataset();
    const cp = cumulativePenalty(ds, { period: ALL_PERIOD, classCode: "6A03" }, FIXTURE_TODAY, { by: "class", classCodes: ["6A03"], gradeAverage: true });
    const v = classVsGrade(cp, "6A03", 6);
    const own = filterIncidents(ds, { period: ALL_PERIOD, classCode: "6A03" }).reduce((a, i) => a + i.points, 0);
    expect(v.classValue).toBeCloseTo(own, 6);
    expect(v.avgValue).toBeDefined();
    expect(v.diff).toBeCloseTo(v.classValue - (v.avgValue ?? 0), 6);
    expect(classVsGrade(cp, "6A03", 9)).toEqual({ classValue: v.classValue, avgValue: undefined, diff: undefined });
    expect(classVsGradeText({ classValue: 10, avgValue: 6.5, diff: 3.5 }, String)).toBe("Cao hơn trung bình khối 3.5 điểm");
    expect(classVsGradeText({ classValue: 2, avgValue: 4, diff: -2 }, String)).toBe("Thấp hơn trung bình khối 2 điểm");
    expect(classVsGradeText({ classValue: 2, avgValue: 2, diff: 0 }, String)).toBe("Bằng trung bình khối");
    expect(classVsGradeText({ classValue: 2 }, String)).toBeUndefined();
  });

  it("renders the card and the vocabulary KPI tiles", () => {
    const ds = makeFixtureDataset();
    const html = renderToStaticMarkup(createElement(ClassCumulativeCard, { ds, cls: { code: "6A03", grade: 6 }, filters: { period: OCTOBER }, today: FIXTURE_TODAY }));
    expect(html).toContain("Điểm trừ cộng dồn");
    expect(html).toContain("TB khối 6");
    const kpis = renderToStaticMarkup(
      createElement(ClassKpis, {
        current: computeKpis(ds, { period: OCTOBER, classCode: "6A03" }),
        previousNoun: "",
        trend: [],
        scores: [],
        config: ds.config,
        hidden: true,
      }),
    );
    for (const label of ["Sự việc", "Lượt vi phạm", "Số HS vi phạm", "Điểm trừ", "Tên học sinh được ẩn"]) expect(kpis).toContain(label);
  });
});
