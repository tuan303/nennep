import { describe, expect, it } from "vitest";
import { FIXTURE_HOLIDAY_WEEK, FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import { mondayOf } from "../dates";
import { computePoints } from "../scoring";
import * as engine from "../index";

describe("fixture dataset", () => {
  const ds = makeFixtureDataset();

  it("has the documented shape", () => {
    expect(FIXTURE_TODAY).toBe("2026-10-21");
    expect(ds.levelId).toBe("THCS");
    expect(ds.config.rag.approved).toBe(true);
    expect(ds.classes).toHaveLength(9);
    expect(ds.classes.filter((c) => !c.active).map((c) => c.code)).toEqual(["7A04"]);
    expect(new Set(ds.classes.map((c) => c.grade))).toEqual(new Set([6, 7]));
    expect(ds.students).toHaveLength(60);
    expect(ds.students.filter((s) => s.status === "TRANSFERRED_OUT").map((s) => s.id)).toEqual([FIXTURE_STUDENT_IDS.long]);
    expect(new Set(ds.students.map((s) => s.id)).size).toBe(60);
    expect(ds.incidents).toHaveLength(80);
    expect(new Set(ds.incidents.map((i) => i.id)).size).toBe(80);
    expect(ds.weeks.filter((w) => !w.counted).map((w) => w.weekStart)).toEqual([FIXTURE_HOLIDAY_WEEK]);
    expect(new Set(ds.rewards.map((r) => r.status))).toEqual(new Set(["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"]));
  });

  it("incidents are rule-correct and inside the documented weeks", () => {
    const catalog = new Map(ds.catalog.map((c) => [c.code, c]));
    for (const i of ds.incidents) {
      expect(i.week).toBe(mondayOf(i.date));
      expect(i.week >= "2026-09-07" && i.week <= "2026-10-19").toBe(true);
      expect(i.date <= FIXTURE_TODAY).toBe(true);
      expect(catalog.get(i.errorCode)?.penalty).toBe(i.penalty);
      expect(i.points).toBe(
        computePoints({ unit: i.unit, penalty: i.penalty, namedCount: i.students.length, unnamedCount: i.unnamedCount, occurrenceCount: i.occurrenceCount }),
      );
      expect(i.relatedStudentCount).toBe(i.students.length + i.unnamedCount);
      expect(ds.classes.find((c) => c.code === i.classCode)?.active).toBe(true);
    }
    const checks = new Set(ds.incidents.map((i) => i.dataCheck));
    expect(checks).toEqual(new Set(["OK", "THIEU_TEN_HS", "REVIEW"]));
    expect(new Set(ds.incidents.map((i) => i.errorCode))).toEqual(new Set(["L01", "L02", "L03", "L04", "L05", "L10", "L14", "L28", "L35"]));
  });

  it("returns fresh objects on every call", () => {
    const a = makeFixtureDataset();
    a.incidents.pop();
    a.config.rag.approved = false;
    const b = makeFixtureDataset();
    expect(b.incidents).toHaveLength(80);
    expect(b.config.rag.approved).toBe(true);
  });

  it("the engine index re-exports dates, scoring and analytics", () => {
    for (const name of ["mondayOf", "buildIncidentCore", "periodOptions", "filterIncidents", "ragFor", "buildRanking", "computeKpis", "recidivism", "buildDecisionBrief", "normalizeVN"]) {
      expect(typeof (engine as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
