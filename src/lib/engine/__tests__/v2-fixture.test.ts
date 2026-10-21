import { describe, expect, it } from "vitest";
import { makeFixtureDataset } from "../__fixtures__/dataset";
import { V2_CATEGORIES, V2_FIXTURE_IDS, V2_INSPECTION_IDS, makeV2FixtureDataset } from "../__fixtures__/dataset-v2";
import { mondayOf } from "../dates";
import { computePoints } from "../scoring";
import * as engine from "../index";

describe("v2 fixture dataset", () => {
  const base = makeFixtureDataset();
  const ds = makeV2FixtureDataset();

  it("leaves makeFixtureDataset() untouched and extends it", () => {
    expect(base.incidents).toHaveLength(80);
    expect("inspections" in base).toBe(false);
    expect(ds.incidents).toHaveLength(87);
    expect(ds.incidents.slice(0, 80)).toEqual(base.incidents);
    expect(ds.rewards).toEqual(base.rewards);
    expect(ds.classes).toEqual(base.classes);
    expect(ds.students).toEqual(base.students);
    expect(new Set(ds.incidents.map((i) => i.id)).size).toBe(87);
  });

  it("names every story record and keeps the extras rule-correct except the integrity defect", () => {
    const byId = new Map(ds.incidents.map((i) => [i.id, i]));
    for (const id of Object.values(V2_FIXTURE_IDS)) expect(byId.has(id), id).toBe(true);
    for (const i of ds.incidents.slice(80)) {
      expect(i.week).toBe(mondayOf(i.date));
      expect(i.relatedStudentCount).toBe(i.students.length + i.unnamedCount);
      const rule = computePoints({ unit: i.unit, penalty: i.penalty, namedCount: i.students.length, unnamedCount: i.unnamedCount, occurrenceCount: i.occurrenceCount });
      if (i.id === V2_FIXTURE_IDS.defect) expect(i.points).not.toBe(rule);
      else expect(i.points).toBe(rule);
    }
    expect(byId.get(V2_FIXTURE_IDS.serious)).toMatchObject({ group: "Nhóm 3", status: "Mới ghi nhận", classCode: "6A05", points: 10 });
    expect(byId.get(V2_FIXTURE_IDS.reviewed)?.notDuplicateOf).toEqual([V2_FIXTURE_IDS.reviewedOf]);
    expect(byId.get(V2_FIXTURE_IDS.dupNamed)?.students).toEqual(byId.get(V2_FIXTURE_IDS.dupNamedOf)?.students);
    expect(byId.get(V2_FIXTURE_IDS.dupUnnamed)?.students).toEqual([]);
    expect(byId.get(V2_FIXTURE_IDS.prolongedBase)).toMatchObject({ classCode: "7A01", errorCode: "L14", week: "2026-09-28" });
  });

  it("has inspection rounds: one deleted, general ones, one per Mảng, both shifts", () => {
    const rounds = ds.inspections ?? [];
    expect(rounds).toHaveLength(8);
    expect(rounds.map((r) => r.id).sort()).toEqual(Object.values(V2_INSPECTION_IDS).sort());
    expect(rounds.filter((r) => r.deletedAt).map((r) => r.id)).toEqual([V2_INSPECTION_IDS.deleted1020]);
    expect(rounds.filter((r) => !r.category).map((r) => r.id)).toEqual([V2_INSPECTION_IDS.general0907, V2_INSPECTION_IDS.general1019]);
    expect(new Set(rounds.map((r) => r.category).filter(Boolean))).toEqual(new Set(base.catalog.map((c) => c.category)));
    expect(new Set(Object.values(V2_CATEGORIES))).toEqual(new Set(base.catalog.map((c) => c.category)));
    expect(new Set(rounds.map((r) => r.shift))).toEqual(new Set(["Sáng", "Chiều", undefined]));
    const active = new Set(ds.classes.filter((c) => c.active).map((c) => c.code));
    for (const r of rounds) {
      expect(r.code).toMatch(/^DKT-\d{8}-\d{3}$/);
      expect(r.id).toBe(`THCS_${r.code}`);
      expect(r.week).toBe(mondayOf(r.date));
      expect(r.month).toBe(r.week.slice(0, 7));
      expect(r.semester).toBe("HK1");
      expect(r.classCodes.length).toBeGreaterThan(0);
      for (const c of r.classCodes) expect(active.has(c)).toBe(true);
    }
  });

  it("returns fresh objects on every call", () => {
    const a = makeV2FixtureDataset();
    a.incidents.pop();
    a.inspections?.pop();
    const b = makeV2FixtureDataset();
    expect(b.incidents).toHaveLength(87);
    expect(b.inspections).toHaveLength(8);
  });

  it("the engine index re-exports the v2 API", () => {
    const names = [
      "violationTurnsOf",
      "groupBreakdown",
      "cumulativePenalty",
      "rankHistory",
      "isPossibleDuplicatePair",
      "possibleDuplicatesOf",
      "findPossibleDuplicates",
      "integrityIssues",
      "resolveEarlyWarning",
      "earlyWarnings",
      "warningReferenceWeek",
      "earlyWarningCounts",
      "filterInspections",
      "inspectionCoverage",
    ];
    for (const name of names) expect(typeof (engine as Record<string, unknown>)[name], name).toBe("function");
    expect(engine.NO_GROUP_LABEL).toBe("Chưa phân nhóm");
    expect(engine.DEFAULT_COVERAGE_MIN_RATIO).toBe(0.6);
    expect(engine.EARLY_WARNING_KIND_LABELS.PROLONGED_ERROR).toBe("Lỗi kéo dài");
    expect(engine.DEFAULT_EARLY_WARNING.prolongedWeeks).toBe(3);
  });
});
