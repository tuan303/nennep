import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { studentStats, type StudentStat } from "@/lib/engine";
import type { GlobalFilters } from "@/lib/types";
import {
  DEFAULT_ROW_FILTER,
  INCIDENT_BUCKETS,
  activeStudentsInScope,
  alertRank,
  errorChips,
  filterStudentRows,
  incidentDistribution,
  isDefaultRowFilter,
  multiIncidentShare,
  nameSortKey,
  scopeText,
  shortIssue,
  studentsExportFileName,
  summarizeStudents,
  toExportRows,
  topStudentsChart,
} from "../lib/students-model";

const ALL: GlobalFilters = { period: { mode: "all" } };

describe("summary", () => {
  const ds = makeFixtureDataset();
  const stats = studentStats(ds, ALL, FIXTURE_TODAY);

  it("counts students with incidents and alerts from the engine", () => {
    const s = summarizeStudents(stats, ds.students, ALL);
    expect(s.withIncidents).toBe(stats.length);
    expect(s.weeklyRed).toBe(stats.filter((x) => x.alert === "WEEKLY_RED").length);
    expect(s.weeklyRed).toBeGreaterThanOrEqual(1);
    expect(s.repeat).toBe(stats.filter((x) => x.alert === "REPEAT").length);
    expect(stats.find((x) => x.id === FIXTURE_STUDENT_IDS.dat)?.alert).not.toBe("NONE");
  });

  it("uses ACTIVE students in scope as the denominator (transferred students excluded)", () => {
    const s = summarizeStudents(stats, ds.students, ALL);
    expect(s.activeInScope).toBe(59);
    expect(stats.some((x) => x.id === FIXTURE_STUDENT_IDS.long)).toBe(true);
    expect(s.activeWithIncidents).toBe(stats.length - 1);
    expect(s.ratio).toBeCloseTo(s.activeWithIncidents / 59);
  });

  it("scopes the denominator by class / grade", () => {
    expect(activeStudentsInScope(ds.students, { classCode: "6A03" })).toHaveLength(8);
    expect(activeStudentsInScope(ds.students, { grade: 7 })).toHaveLength(22);
    const f: GlobalFilters = { period: { mode: "all" }, classCode: "6A03" };
    const s = summarizeStudents(studentStats(ds, f, FIXTURE_TODAY), ds.students, f);
    expect(s.activeInScope).toBe(8);
    expect(s.ratio).toBeGreaterThan(0);
    expect(s.ratio).toBeLessThanOrEqual(1);
  });

  it("ratio is 0 when nobody is in scope", () => {
    expect(summarizeStudents([], [], {}).ratio).toBe(0);
  });
});

describe("row filters", () => {
  const ds = makeFixtureDataset();
  const stats = studentStats(ds, ALL, FIXTURE_TODAY);

  it("search ignores accents and matches ids and classes", () => {
    const names = filterStudentRows(stats, { ...DEFAULT_ROW_FILTER, query: "dat" }).map((s) => s.name);
    expect(names).toContain("Đỗ Văn Đạt");
    expect(filterStudentRows(stats, { ...DEFAULT_ROW_FILTER, query: FIXTURE_STUDENT_IDS.khoi }).map((s) => s.name)).toEqual(["Phạm Thiện Khôi"]);
    expect(filterStudentRows(stats, { ...DEFAULT_ROW_FILTER, query: "6a03" }).every((s) => s.classCode === "6A03")).toBe(true);
  });

  it("filters by alert and minimum incidents, keeping engine order", () => {
    const red = filterStudentRows(stats, { ...DEFAULT_ROW_FILTER, alert: "WEEKLY_RED" });
    expect(red.every((s) => s.alert === "WEEKLY_RED")).toBe(true);
    const many = filterStudentRows(stats, { ...DEFAULT_ROW_FILTER, minIncidents: 3 });
    expect(many.every((s) => s.incidents >= 3)).toBe(true);
    expect(many).toEqual(stats.filter((s) => s.incidents >= 3));
  });

  it("knows the default filter", () => {
    expect(isDefaultRowFilter(DEFAULT_ROW_FILTER)).toBe(true);
    expect(isDefaultRowFilter({ ...DEFAULT_ROW_FILTER, query: " x " })).toBe(false);
    expect(isDefaultRowFilter({ ...DEFAULT_ROW_FILTER, minIncidents: 2 })).toBe(false);
  });

  it("sorts names by given name first", () => {
    expect(nameSortKey("Phạm Thiện Khôi")).toBe("Khôi Phạm Thiện Khôi");
    expect(nameSortKey("  An ")).toBe("An");
    const sorted = ["Trần Văn Bình", "Nguyễn Thị An", "Lê Văn Cường"].sort((a, b) => nameSortKey(a).localeCompare(nameSortKey(b), "vi"));
    expect(sorted).toEqual(["Nguyễn Thị An", "Trần Văn Bình", "Lê Văn Cường"]);
  });

  it("ranks alerts", () => {
    expect(alertRank("WEEKLY_RED")).toBeGreaterThan(alertRank("REPEAT"));
    expect(alertRank("REPEAT")).toBeGreaterThan(alertRank("NONE"));
  });
});

describe("error chips", () => {
  it("shortens issues at separators and word boundaries", () => {
    expect(shortIssue("Đi học muộn")).toBe("Đi học muộn");
    expect(shortIssue("Đồng phục không đúng quy định")).toBe("Đồng phục không đúng…");
    expect(shortIssue("Đầu tóc không gọn gàng; nhuộm tóc")).toBe("Đầu tóc không gọn gàng");
    expect(shortIssue("Làm mất trật tự trong giờ: nói chuyện riêng, đọc truyện…")).toBe("Làm mất trật tự trong…");
    expect(shortIssue("Đồng phục không đúng quy định", "Đồng phục")).toBe("Đồng phục");
  });

  it("keeps at most 3 chips and counts the rest", () => {
    const errors: StudentStat["errors"] = [
      { errorCode: "L02", issue: "Đồng phục không đúng quy định", count: 3 },
      { errorCode: "L01", issue: "Đi học muộn", count: 2 },
      { errorCode: "L05", issue: "Làm mất trật tự", count: 1 },
      { errorCode: "L28", issue: "Đầu tóc", count: 1 },
      { errorCode: "L35", issue: "Bạo lực", count: 1 },
    ];
    const { chips, more } = errorChips(errors, [{ code: "L02", displayName: "Đồng phục" }]);
    expect(chips.map((c) => `${c.label} ×${c.count}`)).toEqual(["Đồng phục ×3", "Đi học muộn ×2", "Làm mất trật tự ×1"]);
    expect(more).toBe(2);
    expect(errorChips(errors.slice(0, 2), []).more).toBe(0);
  });
});

describe("charts", () => {
  const ds = makeFixtureDataset();
  const stats = studentStats(ds, ALL, FIXTURE_TODAY);

  it("top 10 students by incidents with ids for drill-down", () => {
    const top = topStudentsChart(stats);
    expect(top.categories).toHaveLength(Math.min(10, stats.length));
    expect(top.ids[0]).toBe(stats[0].id);
    expect(top.categories[0]).toBe(`${stats[0].name} (${stats[0].classCode})`);
    expect([...top.incidents]).toEqual([...top.incidents].sort((a, b) => b - a));
  });

  it("distribution 1 / 2 / 3 / 4+ covers every student", () => {
    const dist = incidentDistribution(stats);
    expect(dist).toHaveLength(INCIDENT_BUCKETS.length);
    expect(dist.reduce((a, b) => a + b, 0)).toBe(stats.length);
    expect(dist[3]).toBe(stats.filter((s) => s.incidents >= 4).length);
  });

  it("share of students with 2+ incidents", () => {
    expect(multiIncidentShare([6, 2, 1, 1])).toBeCloseTo(0.4);
    expect(multiIncidentShare([0, 0, 0, 0])).toBe(0);
    expect(multiIncidentShare([])).toBe(0);
  });
});

describe("export", () => {
  const ds = makeFixtureDataset();
  const stats = studentStats(ds, ALL, FIXTURE_TODAY);

  it("maps stats to export rows", () => {
    const rows = toExportRows(stats);
    const khoi = rows.find((r) => r.id === FIXTURE_STUDENT_IDS.khoi);
    expect(khoi).toMatchObject({ name: "Phạm Thiện Khôi", classCode: "6A03", alert: "WEEKLY_RED" });
    expect(khoi?.errors).toBe(
      "Đi học muộn (2); Làm mất trật tự trong giờ: nói chuyện riêng, đọc truyện… (2); Bạo lực học đường dưới mọi hình thức (1)",
    );
  });

  it("names files and scopes", () => {
    expect(studentsExportFileName("THCS", { mode: "month", key: "2026-10" })).toBe("Hoc-sinh-vi-pham-THCS-thang-10-2026.xlsx");
    expect(studentsExportFileName("THCS", { mode: "all" }, { classCode: "6A03" })).toBe("Hoc-sinh-vi-pham-THCS-6A03-ca-nam.xlsx");
    expect(studentsExportFileName("TH", { mode: "semester", key: "HK1" }, { grade: 3 })).toBe("Hoc-sinh-vi-pham-TH-khoi-3-HK1.xlsx");
    expect(scopeText({ classCode: "6A03", grade: 6 })).toBe("Lớp 6A03");
    expect(scopeText({ grade: 6 })).toBe("Khối 6");
    expect(scopeText({})).toBe("");
  });
});
