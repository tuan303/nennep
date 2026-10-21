import { describe, expect, it } from "vitest";
import type { GlobalFilters, Inspection, LevelDataset } from "../../types";
import { FIXTURE_STUDENT_IDS as IDS, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import { V2_CATEGORIES as CAT, V2_INSPECTION_IDS as R, makeV2FixtureDataset } from "../__fixtures__/dataset-v2";
import { filterIncidents } from "../filters";
import { DEFAULT_COVERAGE_MIN_RATIO, filterInspections, inspectionCoverage } from "../inspections";
import { round2 } from "../scoring";

const ds = makeV2FixtureDataset();
const ALL: GlobalFilters = { period: { mode: "all" } };
const OCT: GlobalFilters = { period: { mode: "month", key: "2026-10" } };
const ids = (list: Inspection[]) => list.map((r) => r.id);

/** Extra round on top of the v2 fixture (fictional). */
function withRound(patch: Partial<Inspection> & Pick<Inspection, "date" | "classCodes">): LevelDataset {
  const code = `DKT-${patch.date.replaceAll("-", "")}-009`;
  const round: Inspection = {
    id: `THCS_${code}`,
    code,
    levelId: "THCS",
    week: "2026-10-12",
    month: "2026-10",
    semester: "HK1",
    inspector: "Nguyễn Văn A",
    createdBy: "u1",
    createdByName: "Nguyễn Văn A",
    createdAt: `${patch.date}T02:00:00.000Z`,
    ...patch,
  };
  return { ...ds, inspections: [...(ds.inspections ?? []), round] };
}

describe("filterInspections", () => {
  it("non-deleted rounds, newest first (date desc, code desc)", () => {
    expect(ids(filterInspections(ds, ALL, FIXTURE_TODAY))).toEqual([
      R.general1019,
      R.cc1012,
      R.khac1012,
      R.bt1005,
      R.ht0921,
      R.cc0914,
      R.general0907,
    ]);
  });

  it("only rounds dated up to today", () => {
    const ds2 = withRound({ date: "2026-10-22", week: "2026-10-19", classCodes: ["6A05"] });
    expect(filterInspections(ds2, ALL, FIXTURE_TODAY)).toHaveLength(7);
    expect(filterInspections(ds2, ALL, "2026-10-23")).toHaveLength(8);
  });

  it("period: week / month / semester", () => {
    expect(ids(filterInspections(ds, OCT, FIXTURE_TODAY))).toEqual([R.general1019, R.cc1012, R.khac1012, R.bt1005]);
    expect(ids(filterInspections(ds, { period: { mode: "week", key: "2026-10-12" } }, FIXTURE_TODAY))).toEqual([R.cc1012, R.khac1012]);
    expect(filterInspections(ds, { period: { mode: "month", key: "2026-09" } }, FIXTURE_TODAY)).toHaveLength(3);
    expect(filterInspections(ds, { period: { mode: "semester", key: "HK1" } }, FIXTURE_TODAY)).toHaveLength(7);
    expect(filterInspections(ds, { period: { mode: "semester", key: "HK2" } }, FIXTURE_TODAY)).toEqual([]);
  });

  it("Mảng filter keeps that Mảng plus general rounds", () => {
    expect(ids(filterInspections(ds, { ...ALL, category: CAT.cc }, FIXTURE_TODAY))).toEqual([R.general1019, R.cc1012, R.cc0914, R.general0907]);
    expect(ids(filterInspections(ds, { ...ALL, category: CAT.bt }, FIXTURE_TODAY))).toEqual([R.general1019, R.bt1005, R.general0907]);
  });

  it("grade / class filters keep rounds touching a class of the scope grade", () => {
    expect(filterInspections(ds, { ...ALL, grade: 6 }, FIXTURE_TODAY)).toHaveLength(7);
    expect(ids(filterInspections(ds, { ...ALL, grade: 7 }, FIXTURE_TODAY))).not.toContain(R.cc1012); // 6A02 + 6A04 only
    expect(filterInspections(ds, { ...ALL, grade: 7 }, FIXTURE_TODAY)).toHaveLength(6);
    // Class filter → that class's grade (population unchanged): rounds without 7A03 stay.
    expect(filterInspections(ds, { ...ALL, classCode: "7A03" }, FIXTURE_TODAY)).toHaveLength(6);
    expect(filterInspections(ds, { ...ALL, grade: 6, classCode: "7A03" }, FIXTURE_TODAY)).toEqual([]);
    expect(filterInspections(ds, { ...ALL, grade: 9 }, FIXTURE_TODAY)).toEqual([]);
  });

  it("error / group / student filters are ignored", () => {
    const f: GlobalFilters = { ...ALL, errorCode: "L35", group: "Nhóm 3", studentId: IDS.khoi };
    expect(filterInspections(ds, f, FIXTURE_TODAY)).toEqual(filterInspections(ds, ALL, FIXTURE_TODAY));
  });

  it("datasets without inspections → []", () => {
    const base = makeFixtureDataset();
    expect(filterInspections(base, ALL, FIXTURE_TODAY)).toEqual([]);
  });
});

describe("inspectionCoverage", () => {
  it("whole year: totals, per-grade rows in display order and flagged classes", () => {
    const cov = inspectionCoverage(ds, ALL, FIXTURE_TODAY);
    expect(cov).toMatchObject({ rounds: 7, sessions: 6, classesInspected: 7, classesTotal: 8, minRatio: DEFAULT_COVERAGE_MIN_RATIO });
    expect(cov.grades.map((g) => [g.grade, g.avgRounds, g.minRounds, g.maxRounds, g.noInspections])).toEqual([
      [6, 4.2, 0, 6, false],
      [7, 4.33, 1, 6, false],
    ]);
    expect(cov.grades[0].rows.map((r) => [r.classCode, r.rounds, r.status])).toEqual([
      ["6A01", 5, "OK"],
      ["6A02", 5, "OK"],
      ["6A03", 6, "OK"],
      ["6A04", 5, "OK"],
      ["6A05", 0, "NONE"],
    ]);
    expect(cov.grades[1].rows.map((r) => r.classCode)).toEqual(["7A01", "7A02", "7A03"]); // 7A04 inactive
    expect(cov.flagged.map((r) => [r.classCode, r.status, r.coverageRatio])).toEqual([
      ["6A05", "NONE", 0],
      ["7A03", "LOW", 0.23],
    ]);
  });

  it("row details: sessions, last date, incidents per round, ratio vs grade average", () => {
    const cov = inspectionCoverage(ds, ALL, FIXTURE_TODAY);
    const row = (code: string) => cov.grades.flatMap((g) => g.rows).find((r) => r.classCode === code);
    const inc6A03 = filterIncidents(ds, { ...ALL, classCode: "6A03" });
    expect(row("6A03")).toEqual({
      classCode: "6A03",
      grade: 6,
      homeroomTeacher: "Lê Văn Hùng",
      rounds: 6,
      sessions: 6,
      lastDate: "2026-10-19",
      incidents: inc6A03.length,
      points: round2(inc6A03.reduce((s, i) => s + i.points, 0)),
      incidentsPerRound: round2(inc6A03.length / 6),
      gradeAvgRounds: 4.2,
      coverageRatio: 1.43,
      status: "OK",
      highlighted: false,
    });
    expect(row("6A05")).toMatchObject({ rounds: 0, sessions: 0, incidentsPerRound: null, coverageRatio: 0, status: "NONE" });
    expect(row("6A05")?.lastDate).toBeUndefined();
    expect(row("7A03")).toMatchObject({ rounds: 1, lastDate: "2026-09-07", status: "LOW", gradeAvgRounds: 4.33 });
  });

  it("a session (date + buổi) is counted once per class", () => {
    const ds2 = withRound({ date: "2026-10-12", shift: "Chiều", category: CAT.ht, classCodes: ["6A01"] });
    const row = inspectionCoverage(ds2, ALL, FIXTURE_TODAY).grades[0].rows[0];
    expect(row).toMatchObject({ classCode: "6A01", rounds: 6, sessions: 5 });
  });

  it("period: October flags never-inspected classes in each grade", () => {
    const cov = inspectionCoverage(ds, OCT, FIXTURE_TODAY);
    expect(cov.rounds).toBe(4);
    expect(cov.sessions).toBe(3);
    expect(cov.grades.map((g) => g.avgRounds)).toEqual([2.2, 2]);
    expect(cov.flagged.map((r) => [r.classCode, r.status])).toEqual([
      ["6A05", "NONE"],
      ["7A03", "NONE"],
    ]);
  });

  it("Mảng filter limits rounds and incidents", () => {
    const f: GlobalFilters = { ...ALL, category: CAT.cc };
    const cov = inspectionCoverage(ds, f, FIXTURE_TODAY);
    expect(cov.rounds).toBe(4);
    const r6A01 = cov.grades[0].rows[0];
    expect(r6A01.rounds).toBe(3); // general 07/09, CC 14/09, general 19/10
    expect(r6A01.incidents).toBe(filterIncidents(ds, { ...f, classCode: "6A01" }).length);
  });

  it("class filter: its grade only, population unchanged, row highlighted", () => {
    const cov = inspectionCoverage(ds, { ...ALL, classCode: "6A03" }, FIXTURE_TODAY);
    expect(cov.grades.map((g) => g.grade)).toEqual([6]);
    expect(cov.classesTotal).toBe(5);
    expect(cov.grades[0].rows.filter((r) => r.highlighted).map((r) => r.classCode)).toEqual(["6A03"]);
    const plain = inspectionCoverage(ds, { ...ALL, grade: 6 }, FIXTURE_TODAY);
    expect(cov.grades[0].rows.map((r) => ({ ...r, highlighted: false }))).toEqual(plain.grades[0].rows);
    // The student filter does not restrict incident counts either.
    const withStudent = inspectionCoverage(ds, { ...ALL, grade: 6, studentId: IDS.khoi }, FIXTURE_TODAY);
    expect(withStudent.grades[0].rows).toEqual(plain.grades[0].rows);
  });

  it("errorCode restricts incidents, not rounds", () => {
    const cov = inspectionCoverage(ds, { ...ALL, errorCode: "L01" }, FIXTURE_TODAY);
    const all = inspectionCoverage(ds, ALL, FIXTURE_TODAY);
    expect(cov.rounds).toBe(all.rounds);
    const row = cov.grades[0].rows.find((r) => r.classCode === "6A03");
    expect(row?.incidents).toBe(filterIncidents(ds, { ...ALL, errorCode: "L01", classCode: "6A03" }).length);
    expect(row?.rounds).toBe(6);
  });

  it("minRatio option", () => {
    const cov = inspectionCoverage(ds, ALL, FIXTURE_TODAY, { minRatio: 1.2 });
    expect(cov.minRatio).toBe(1.2);
    expect(cov.flagged.map((r) => [r.classCode, r.status])).toEqual([
      ["6A05", "NONE"],
      ["7A03", "LOW"],
      ["6A01", "LOW"],
      ["6A02", "LOW"],
      ["6A04", "LOW"],
    ]);
  });

  it("inactive classes named in a round are not listed", () => {
    const ds2 = withRound({ date: "2026-10-13", classCodes: ["7A04", "7A03"] });
    const cov = inspectionCoverage(ds2, { ...ALL, grade: 7 }, FIXTURE_TODAY);
    expect(cov.grades[0].rows.map((r) => r.classCode)).toEqual(["7A01", "7A02", "7A03"]);
    expect(cov.grades[0].rows[2].rounds).toBe(2);
  });

  it("dataset without inspections: zeros, nothing flagged", () => {
    const cov = inspectionCoverage(makeFixtureDataset(), ALL, FIXTURE_TODAY);
    expect(cov).toMatchObject({ rounds: 0, sessions: 0, classesInspected: 0, classesTotal: 8, flagged: [] });
    for (const g of cov.grades) {
      expect(g).toMatchObject({ avgRounds: 0, minRounds: 0, maxRounds: 0, noInspections: true });
      for (const r of g.rows) expect(r).toMatchObject({ rounds: 0, coverageRatio: null, incidentsPerRound: null, status: "OK" });
    }
  });
});
