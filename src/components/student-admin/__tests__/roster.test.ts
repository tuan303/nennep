import { describe, expect, it } from "vitest";
import { ALL_PERIOD, studentStats } from "@/lib/engine";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { ClassInfo, StudentLite } from "@/lib/types";
import {
  activeFilterCount,
  activeWithViolations,
  buildRosterIndex,
  classSizeGroups,
  classSizeRows,
  DEFAULT_ROSTER_FILTERS,
  filterDescription,
  filterRoster,
  leftBreakdownText,
  nameSortKey,
  rosterExportRows,
  ROSTER_EXPORT_COLUMNS,
  sizeStateText,
  sizeSummary,
  statusCounts,
  violationCountMap,
} from "../lib/roster";

const ds = makeFixtureDataset();

describe("buildRosterIndex / filterRoster", () => {
  const index = buildRosterIndex(ds.students, ds.classes);

  it("orders by class display order, then Vietnamese given name", () => {
    const codes = index.map((e) => e.student.classCode);
    expect(codes[0]).toBe("6A01");
    expect(codes.at(-1)).toBe("7A03");
    const a01 = index.filter((e) => e.student.classCode === "6A01").map((e) => e.student.name);
    // given names: Anh, Châu, Hân, Huy, Linh, Minh, Phúc
    expect(a01).toEqual(["Trần Bảo Anh", "Lê Minh Châu", "Đặng Ngọc Hân", "Phạm Gia Huy", "Hoàng Khánh Linh", "Vũ Đức Minh", "Nguyễn Trường Phúc"]);
  });

  it("defaults to ACTIVE students only", () => {
    const rows = filterRoster(index, DEFAULT_ROSTER_FILTERS);
    expect(rows).toHaveLength(59);
    expect(rows.some((s) => s.id === FIXTURE_STUDENT_IDS.long)).toBe(false);
  });

  it("LEFT shows every non-active status, ALL shows everybody", () => {
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, status: "LEFT" }).map((s) => s.id)).toEqual([FIXTURE_STUDENT_IDS.long]);
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, status: "ALL" })).toHaveLength(60);
  });

  it("searches name and Mã HS without accents, every token must match", () => {
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, query: "truong phuc" }).map((s) => s.id).sort()).toEqual(
      [FIXTURE_STUDENT_IDS.truongPhuc6A01, FIXTURE_STUDENT_IDS.truongPhuc7A02, FIXTURE_STUDENT_IDS.phucTruong7A01].sort(),
    );
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, query: "Đỗ Văn Đạt" }).map((s) => s.id)).toEqual([FIXTURE_STUDENT_IDS.dat]);
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, query: "260603" })).toHaveLength(8);
  });

  it("filters by grade and class", () => {
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, grade: 7 }).every((s) => s.grade === 7)).toBe(true);
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, classCode: "6A03" })).toHaveLength(8);
    expect(filterRoster(index, { ...DEFAULT_ROSTER_FILTERS, grade: 7, classCode: "6A03" })).toHaveLength(0);
  });

  it("puts students of unknown classes last", () => {
    const extra: StudentLite = { id: "X1", name: "An Bình", classCode: "9Z99", grade: 9, status: "ACTIVE" };
    const idx = buildRosterIndex([extra, ...ds.students], ds.classes);
    expect(idx.at(-1)?.student.id).toBe("X1");
  });
});

describe("activeFilterCount / filterDescription", () => {
  it("counts filters beyond the default view", () => {
    expect(activeFilterCount(DEFAULT_ROSTER_FILTERS)).toBe(0);
    expect(activeFilterCount({ query: " an ", grade: 6, classCode: "6A01", status: "ALL" })).toBe(4);
  });
  it("describes the selection", () => {
    expect(filterDescription({ query: "", status: "ACTIVE" }, "Đang học")).toBe("Tất cả lớp · Đang học");
    expect(filterDescription({ query: "an", grade: 6, classCode: "6A02", status: "ALL" }, "Tất cả")).toBe("Lớp 6A02 · Tất cả · Tìm “an”");
    expect(filterDescription({ query: "", grade: 7, status: "ACTIVE" }, "Đang học")).toBe("Khối 7 · Đang học");
  });
});

describe("nameSortKey", () => {
  it("sorts by given name first", () => {
    const names = ["Nguyễn Văn Bình", "Trần An", "Lê Thị Ánh"];
    expect([...names].sort((a, b) => nameSortKey(a).localeCompare(nameSortKey(b)))).toEqual(["Trần An", "Lê Thị Ánh", "Nguyễn Văn Bình"]);
  });
});

describe("statusCounts", () => {
  it("counts per status", () => {
    const c = statusCounts(ds.students);
    expect(c).toMatchObject({ ACTIVE: 59, TRANSFERRED_OUT: 1, GRADUATED: 0, INACTIVE: 0, left: 1, total: 60 });
    expect(leftBreakdownText(c)).toBe("1 chuyển trường");
    expect(leftBreakdownText({ ...c, GRADUATED: 2, INACTIVE: 1 })).toBe("1 chuyển trường · 2 tốt nghiệp · 1 ngừng theo dõi");
    expect(leftBreakdownText(statusCounts([]))).toBe("");
  });
});

describe("class sizes", () => {
  const rows = classSizeRows(ds.classes, ds.students);

  it("lists active classes with active counts and compares with sourceSize", () => {
    expect(rows.map((r) => r.code)).toEqual(["6A01", "6A02", "6A03", "6A04", "6A05", "7A01", "7A02", "7A03"]);
    const a02 = rows.find((r) => r.code === "6A02");
    // 7 roster names, the transferred student is not counted
    expect(a02?.activeCount).toBe(7);
    expect(a02?.sourceSize).toBe(33);
    expect(a02?.diff).toBe(-26);
    expect(a02?.state).toBe("under");
    expect(sizeStateText(a02!)).toBe("Thiếu 26");
  });

  it("handles match / over / unknown and inactive classes holding students", () => {
    const classes: ClassInfo[] = [
      { code: "1A1", levelId: "TH", grade: 1, active: true, order: 0, sourceSize: 2 },
      { code: "1A2", levelId: "TH", grade: 1, active: true, order: 1, sourceSize: 1 },
      { code: "1A3", levelId: "TH", grade: 1, active: true, order: 2 },
      { code: "2A1", levelId: "TH", grade: 2, active: false, order: 3, sourceSize: 0 },
      { code: "2A2", levelId: "TH", grade: 2, active: false, order: 4 },
    ];
    const st = (id: string, classCode: string, status: StudentLite["status"] = "ACTIVE"): StudentLite => ({ id, name: id, classCode, grade: Number(classCode[0]), status });
    const r = classSizeRows(classes, [st("a", "1A1"), st("b", "1A1"), st("c", "1A2"), st("d", "1A2"), st("e", "2A1"), st("f", "1A3", "GRADUATED")]);
    expect(r.map((x) => [x.code, x.state, sizeStateText(x)])).toEqual([
      ["1A1", "match", "Khớp"],
      ["1A2", "over", "Thừa 1"],
      ["1A3", "unknown", "Chưa có sĩ số nguồn"],
      ["2A1", "over", "Thừa 1"],
    ]);
    expect(sizeSummary(r)).toEqual({ classes: 3, withSource: 3, mismatches: 2, inactiveWithStudents: 1 });
    const groups = classSizeGroups(r);
    expect(groups.map((g) => [g.grade, g.rows.length, g.activeCount, g.mismatches])).toEqual([
      [1, 3, 4, 1],
      [2, 1, 1, 1],
    ]);
  });
});

describe("violations and export", () => {
  const counts = violationCountMap(studentStats(ds, { period: ALL_PERIOD }, FIXTURE_TODAY));

  it("maps student ids to incident counts", () => {
    expect(counts.get(FIXTURE_STUDENT_IDS.khoi)).toBeGreaterThanOrEqual(3);
    expect(counts.get(FIXTURE_STUDENT_IDS.long)).toBe(2);
    expect(activeWithViolations(ds.students, counts)).toBeGreaterThan(0);
    // the transferred student is not counted among active students
    const onlyLong = ds.students.filter((s) => s.id === FIXTURE_STUDENT_IDS.long);
    expect(activeWithViolations(onlyLong, counts)).toBe(0);
  });

  it("builds re-importable rows (headers match the roster parser)", () => {
    const long = ds.students.find((s) => s.id === FIXTURE_STUDENT_IDS.long)!;
    expect(rosterExportRows([long], counts)).toEqual([
      { id: long.id, name: "Vũ Hoàng Long", dob: "2015-03-12", classCode: "6A02", grade: 6, status: "Đã chuyển trường", violations: 2 },
    ]);
    expect(ROSTER_EXPORT_COLUMNS.map((c) => c.header)).toEqual(["Mã HS", "Họ và tên", "Ngày sinh", "Lớp", "Khối", "Trạng thái", "Số lượt vi phạm"]);
    expect(rosterExportRows([{ id: "z", name: "Z", classCode: "6A01", grade: 6, status: "ACTIVE" }], new Map())[0]).toMatchObject({ dob: null, violations: 0 });
  });
});
