import { describe, expect, it } from "vitest";
import type { CatalogItem, GlobalFilters, Incident } from "../../types";
import { FIXTURE_STUDENT_IDS as IDS, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import {
  NO_GROUP_LABEL,
  classStats,
  computeKpis,
  groupBreakdown,
  kpiComparison,
  studentHistory,
  studentStats,
  topIssues,
  violationTurnsOf,
  weeklyTrend,
} from "../analytics";
import { filterIncidents, filterRewards } from "../filters";
import { round2 } from "../scoring";
import { makeIncident } from "./builders";

const ds = makeFixtureDataset();
const ALL: GlobalFilters = { period: { mode: "all" } };
const W05: GlobalFilters = { period: { mode: "week", key: "2026-10-05" } };
const W12: GlobalFilters = { period: { mode: "week", key: "2026-10-12" } };
const sumPoints = (list: Incident[]) => round2(list.reduce((s, i) => s + i.points, 0));
const turns = (list: Incident[]) => list.reduce((s, i) => s + violationTurnsOf(i), 0);

describe("filterIncidents – Nhóm lỗi (group) and Mã HS (studentId)", () => {
  it("group keeps incidents whose snapshot group equals the filter", () => {
    const g3 = filterIncidents(ds, { ...ALL, group: "Nhóm 3" });
    expect(g3.length).toBeGreaterThan(0);
    expect(g3).toEqual(ds.incidents.filter((i) => i.group === "Nhóm 3"));
    expect(new Set(g3.map((i) => i.errorCode))).toEqual(new Set(["L10", "L35"]));
    expect(filterIncidents(ds, { ...ALL, group: "Nhóm 3", errorCode: "L01" })).toEqual([]);
    expect(filterIncidents(ds, { ...ALL, group: "Nhóm 9" })).toEqual([]);
  });

  it("an incident without group only matches when no group filter is set", () => {
    const noGroup = makeIncident({ date: "2026-10-12", classCode: "6A01" });
    const ds2 = { ...ds, incidents: [...ds.incidents, noGroup] };
    expect(filterIncidents(ds2, ALL)).toContain(noGroup);
    expect(filterIncidents(ds2, { ...ALL, group: "Nhóm 1" })).not.toContain(noGroup);
  });

  it("studentId keeps incidents naming the student", () => {
    const khoi = filterIncidents(ds, { ...ALL, studentId: IDS.khoi });
    expect(khoi.length).toBeGreaterThan(0);
    for (const i of khoi) expect(i.students.some((s) => s.id === IDS.khoi)).toBe(true);
    expect(new Set(khoi.map((i) => i.id))).toEqual(new Set(studentHistory(ds, IDS.khoi).map((i) => i.id)));
    expect(filterIncidents(ds, { ...W12, studentId: IDS.khoi })).toHaveLength(3); // WEEKLY_RED story
    expect(filterIncidents(ds, { ...ALL, studentId: "HS-KHONG-CO" })).toEqual([]);
    // Combined with other filters.
    expect(filterIncidents(ds, { ...ALL, studentId: IDS.khoi, errorCode: "L35" }).map((i) => i.errorCode)).toEqual(["L35"]);
    expect(filterIncidents(ds, { ...ALL, studentId: IDS.khoi, classCode: "6A01" })).toEqual([]);
  });

  it("filterRewards ignores group and studentId", () => {
    expect(filterRewards(ds, { ...ALL, group: "Nhóm 3", studentId: IDS.khoi })).toEqual(filterRewards(ds, ALL));
  });

  it("every consumer inherits the new filters", () => {
    const f: GlobalFilters = { ...ALL, group: "Nhóm 3" };
    const g3 = filterIncidents(ds, f);
    const k = computeKpis(ds, f);
    expect(k.incidents).toBe(g3.length);
    expect(k.penaltyPoints).toBe(sumPoints(g3));
    expect(k.rewardPoints).toBe(computeKpis(ds, ALL).rewardPoints);
    expect(classStats(ds, f).reduce((s, c) => s + c.incidents, 0)).toBe(g3.length);
    expect(weeklyTrend(ds, f, FIXTURE_TODAY).reduce((s, p) => s + p.incidents, 0)).toBe(g3.length);

    const fs: GlobalFilters = { ...ALL, studentId: IDS.khoi };
    const own = filterIncidents(ds, fs);
    const stats = studentStats(ds, fs, FIXTURE_TODAY);
    expect(stats.find((s) => s.id === IDS.khoi)?.incidents).toBe(own.length);
    for (const s of stats) expect(s.incidents).toBeLessThanOrEqual(own.length);
  });
});

describe("Lượt vi phạm (violationTurns)", () => {
  it("violationTurnsOf: /HS → related students (named + unnamed), /lần → occurrences (≥ 1)", () => {
    expect(violationTurnsOf({ unit: "/HS", relatedStudentCount: 5, occurrenceCount: 1 })).toBe(5);
    expect(violationTurnsOf({ unit: "/HS", relatedStudentCount: 0, occurrenceCount: 1 })).toBe(0);
    expect(violationTurnsOf({ unit: "/lần", relatedStudentCount: 3, occurrenceCount: 2 })).toBe(2);
    expect(violationTurnsOf({ unit: "/lần", relatedStudentCount: 0, occurrenceCount: 0 })).toBe(1);
  });

  it("Kpis.violationTurns sums the filtered incidents (one 'Tập thể' record with unnamed students)", () => {
    const k = computeKpis(ds, { ...W05, classCode: "6A04" });
    // 6A04, 2026-10-06, L01 /HS: 2 named + 3 unnamed students.
    expect(k).toMatchObject({ incidents: 1, violationTurns: 5, relatedStudents: 5, uniqueStudents: 2, unnamedStudentCount: 3, penaltyPoints: 10 });
  });

  it("Kpis.violationTurns counts /lần occurrences, never students", () => {
    const k = computeKpis(ds, { ...W12, classCode: "7A02" });
    // L02 /HS 1 student + L10 /lần ×2.
    expect(k).toMatchObject({ incidents: 2, violationTurns: 3, relatedStudents: 1, penaltyPoints: 12 });
  });

  it("whole year: violationTurns = Σ /HS related students + Σ /lần occurrences", () => {
    const k = computeKpis(ds, ALL);
    const hs = ds.incidents.filter((i) => i.unit === "/HS");
    const lan = ds.incidents.filter((i) => i.unit === "/lần");
    expect(k.violationTurns).toBe(hs.reduce((s, i) => s + i.relatedStudentCount, 0) + lan.reduce((s, i) => s + i.occurrenceCount, 0));
    const { previous } = kpiComparison(ds, W12);
    expect(previous?.violationTurns).toBe(turns(filterIncidents(ds, W05)));
  });

  it("IssueStat and ClassStat carry violationTurns", () => {
    const l10 = topIssues(filterIncidents(ds, ALL), Infinity).find((s) => s.errorCode === "L10");
    expect(l10).toMatchObject({ incidents: 5, violationTurns: 6, students: 1 });
    for (const c of classStats(ds, ALL)) {
      expect(c.violationTurns).toBe(turns(filterIncidents(ds, { ...ALL, classCode: c.classCode })));
    }
    expect(classStats(ds, ALL).find((c) => c.classCode === "6A05")?.violationTurns).toBeGreaterThan(0);
  });
});

describe("groupBreakdown", () => {
  it("splits incidents / turns / points by error group, natural order", () => {
    const all = filterIncidents(ds, ALL);
    const groups = groupBreakdown(all);
    expect(groups.map((g) => g.group)).toEqual(["Nhóm 1", "Nhóm 2", "Nhóm 3"]);
    expect(groups.reduce((s, g) => s + g.incidents, 0)).toBe(all.length);
    expect(round2(groups.reduce((s, g) => s + g.points, 0))).toBe(sumPoints(all));
    expect(groups.reduce((s, g) => s + g.violationTurns, 0)).toBe(turns(all));
    const g3 = groups.find((g) => g.group === "Nhóm 3");
    expect(g3).toEqual({
      group: "Nhóm 3",
      incidents: all.filter((i) => i.group === "Nhóm 3").length,
      violationTurns: turns(all.filter((i) => i.group === "Nhóm 3")),
      points: sumPoints(all.filter((i) => i.group === "Nhóm 3")),
      errorCodes: 2,
    });
    expect(groups.find((g) => g.group === "Nhóm 2")?.errorCodes).toBe(1);
  });

  it("with the catalog every group appears, zeros included", () => {
    const onlyG1 = filterIncidents(ds, { ...ALL, group: "Nhóm 1" });
    expect(groupBreakdown(onlyG1).map((g) => g.group)).toEqual(["Nhóm 1"]);
    const withCatalog = groupBreakdown(onlyG1, ds.catalog);
    expect(withCatalog.map((g) => g.group)).toEqual(["Nhóm 1", "Nhóm 2", "Nhóm 3"]);
    expect(withCatalog[2]).toEqual({ group: "Nhóm 3", incidents: 0, violationTurns: 0, points: 0, errorCodes: 0 });
    expect(groupBreakdown([], ds.catalog).every((g) => g.incidents === 0)).toBe(true);
  });

  it("missing / blank groups fall under NO_GROUP_LABEL, always last", () => {
    const mk = (group: string | undefined, classCode = "6A01"): Incident => ({ ...makeIncident({ date: "2026-10-12", classCode }), group });
    const list = [mk("Nhóm 10"), mk(undefined), mk("Nhóm 2"), mk(""), mk("  ")];
    const groups = groupBreakdown(list);
    expect(groups.map((g) => g.group)).toEqual(["Nhóm 2", "Nhóm 10", NO_GROUP_LABEL]);
    expect(groups[2]).toMatchObject({ incidents: 3, errorCodes: 1 });
    const item = (code: string, group?: string): CatalogItem => ({ code, category: "A", issue: "x", group, penalty: 2, unit: "/HS", is5S: false, active: true });
    expect(groupBreakdown([mk("Nhóm 2")], [item("L01", "Nhóm 1"), item("L02")]).map((g) => g.group)).toEqual(["Nhóm 1", "Nhóm 2", NO_GROUP_LABEL]);
  });
});
