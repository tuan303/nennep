import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { ALL_PERIOD } from "@/lib/engine/period";
import { filterIncidents } from "@/lib/engine/filters";
import { countText, dataCheckCounts, filterIncidentRows, incidentSearchText, reporterOf, subjectsText } from "../lib/incident-rows";

const ds = makeFixtureDataset();
const all = filterIncidents(ds, { period: ALL_PERIOD });

describe("filterIncidentRows", () => {
  it("returns every row without criteria", () => {
    expect(filterIncidentRows(all, {})).toHaveLength(all.length);
  });

  it("searches student names without accents", () => {
    const rows = filterIncidentRows(all, { query: "pham thien khoi" });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((i) => i.students.some((s) => s.id === FIXTURE_STUDENT_IDS.khoi))).toBe(true);
  });

  it("searches by code, class and issue", () => {
    expect(filterIncidentRows(all, { query: "NN-20261014-0002" }).map((i) => i.code)).toEqual(["NN-20261014-0002"]);
    expect(filterIncidentRows(all, { query: "7a03" }).every((i) => i.classCode === "7A03")).toBe(true);
    const late = filterIncidentRows(all, { query: "di hoc muon" });
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((i) => i.errorCode === "L01")).toBe(true);
  });

  it("filters by data check and source", () => {
    const review = filterIncidentRows(all, { dataCheck: "REVIEW" });
    expect(review.length).toBe(3);
    expect(review.every((i) => i.dataCheck === "REVIEW")).toBe(true);
    const imported = filterIncidentRows(all, { source: "import" });
    expect(imported.every((i) => i.source === "import")).toBe(true);
    expect(filterIncidentRows(all, { source: "import", dataCheck: "OK" })).toHaveLength(0);
  });
});

describe("cell texts", () => {
  it("counts each data check", () => {
    const c = dataCheckCounts(all);
    expect(c.REVIEW).toBe(3);
    expect(c.THIEU_TEN_HS).toBe(3);
    expect(c.OK + c.REVIEW + c.THIEU_TEN_HS).toBe(all.length);
  });

  it("describes students or occurrences", () => {
    const unnamed = all.find((i) => i.code === "NN-20261006-0003")!;
    expect(countText(unnamed)).toBe("5 HS (3 chưa rõ tên)");
    const perTime = all.find((i) => i.unit === "/lần")!;
    expect(countText(perTime)).toBe(`${perTime.occurrenceCount} lần`);
    expect(subjectsText(unnamed)).toMatch(/\+ 3 HS chưa rõ tên$/);
    expect(subjectsText({ students: [], unnamedCount: 0, relatedStudentCount: 0 })).toBe("Tập thể lớp");
  });

  it("falls back to the creator as reporter and indexes detail text", () => {
    expect(reporterOf({ reporter: "  ", createdByName: "Cô Lan" })).toBe("Cô Lan");
    const i = { ...all[0], detail: "Ghi chú đặc biệt" };
    expect(incidentSearchText(i)).toContain("Ghi chú đặc biệt");
  });
});
