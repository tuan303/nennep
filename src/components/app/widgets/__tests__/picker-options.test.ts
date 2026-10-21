import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { CatalogItem, ClassInfo, StudentLite } from "@/lib/types";
import { classDescription, classOptions, gradesOf, pickClasses } from "../lib/class-options";
import { RECENT_GROUP, errorOptions, penaltyLabel } from "../lib/error-options";
import { RECENT_ERRORS_KEY, parseRecentStore, pushRecent, readRecentErrors, rememberRecentError } from "../lib/recent-errors";
import { activeStudentsOfClass, compareStudentsByGivenName, frequentStudents, searchStudents } from "../lib/student-options";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const cls = (code: string, grade: number, order: number, extra: Partial<ClassInfo> = {}): ClassInfo => ({
  code,
  levelId: "THCS",
  grade,
  order,
  active: true,
  ...extra,
});

describe("class options", () => {
  const classes = [
    cls("7A01", 7, 1, { homeroomTeacher: "Đặng Thị Lan" }),
    cls("6A10", 6, 10),
    cls("6A2", 6, 2, { homeroomTeacher: "Trần Thị Mai", deputyTeacher: "Lê Phó" }),
    cls("6A1", 6, 1),
    cls("7A04", 7, 4, { active: false, homeroomTeacher: "Ngô Thị Hoa" }),
  ];

  it("keeps active classes only, ordered by grade, order then code", () => {
    expect(pickClasses(classes).map((c) => c.code)).toEqual(["6A1", "6A2", "6A10", "7A01"]);
  });

  it("filters by grade and restrictTo, and keeps the current inactive value", () => {
    expect(pickClasses(classes, { grade: 6 }).map((c) => c.code)).toEqual(["6A1", "6A2", "6A10"]);
    expect(pickClasses(classes, { restrictTo: ["7A01", "6A2"] }).map((c) => c.code)).toEqual(["6A2", "7A01"]);
    expect(pickClasses(classes, { keep: "7A04" }).map((c) => c.code)).toContain("7A04");
    expect(pickClasses(classes, { includeInactive: true })).toHaveLength(5);
  });

  it("builds grouped combobox options with GVCN as description + keywords", () => {
    const opts = classOptions(classes, { grade: 6 }, ["6A10"]);
    expect(opts.map((o) => o.group)).toEqual(["Khối 6", "Khối 6", "Khối 6"]);
    const a2 = opts.find((o) => o.value === "6A2");
    expect(a2?.description).toBe("GVCN: Trần Thị Mai");
    expect(a2?.keywords).toEqual(expect.arrayContaining(["Trần Thị Mai", "Lê Phó"]));
    expect(opts.find((o) => o.value === "6A1")?.description).toBe("Chưa có GVCN");
    expect(opts.find((o) => o.value === "6A10")?.disabled).toBe(true);
    expect(classDescription(classes[4])).toBe("GVCN: Ngô Thị Hoa · ngừng hoạt động");
  });

  it("lists distinct grades", () => {
    expect(gradesOf(classes)).toEqual([6, 7]);
  });
});

describe("error options", () => {
  const catalog: CatalogItem[] = makeFixtureDataset().catalog;
  const withInactive: CatalogItem[] = [...catalog, { ...catalog[0], code: "L99", issue: "Lỗi cũ", active: false }];

  it("formats penalty pills", () => {
    expect(penaltyLabel(2, "/HS")).toBe("2 điểm/HS");
    expect(penaltyLabel(5, "/lần")).toBe("5 điểm/lần");
    expect(penaltyLabel(2.5, "/HS")).toBe("2,5 điểm/HS");
  });

  it("groups by Mảng in catalog order and hides inactive items", () => {
    const opts = errorOptions(withInactive);
    expect(opts).toHaveLength(catalog.length);
    expect(opts[0]).toMatchObject({ value: "L01", group: "Chuyên cần – vệ sinh", label: "Đi học muộn" });
    expect(opts.find((o) => o.value === "L10")?.keywords).toEqual(expect.arrayContaining(["L10", "5 điểm/lần"]));
    expect(opts.some((o) => o.value === "L99")).toBe(false);
  });

  it("shows an inactive current value disabled", () => {
    const opt = errorOptions(withInactive, { keep: "L99" }).find((o) => o.value === "L99");
    expect(opt).toMatchObject({ disabled: true, label: "Lỗi cũ (ngừng sử dụng)" });
  });

  it("pins recent codes first (known + active only, no duplicates, capped)", () => {
    const opts = errorOptions(withInactive, { recent: ["L28", "ZZZ", "L99", "L01", "L28"], recentLimit: 5 });
    expect(opts.slice(0, 2).map((o) => [o.value, o.group])).toEqual([
      ["L28", RECENT_GROUP],
      ["L01", RECENT_GROUP],
    ]);
    expect(opts.filter((o) => o.value === "L01")).toHaveLength(1);
    expect(errorOptions(catalog, { recent: ["L01", "L02", "L03"], recentLimit: 2 }).filter((o) => o.group === RECENT_GROUP)).toHaveLength(2);
  });
});

describe("recent errors storage", () => {
  it("parses tolerantly", () => {
    expect(parseRecentStore(null)).toEqual({});
    expect(parseRecentStore("not json")).toEqual({});
    expect(parseRecentStore('["L01"]')).toEqual({});
    expect(parseRecentStore('{"THCS":["L01",3,""],"XX":["L02"]}')).toEqual({ THCS: ["L01"] });
  });

  it("moves a code to the front without duplicates", () => {
    expect(pushRecent(["L01", "L02", "L03"], "L03")).toEqual(["L03", "L01", "L02"]);
    expect(pushRecent(["L01", "L02"], "L09", 2)).toEqual(["L09", "L01"]);
  });

  it("reads and writes per level", () => {
    const s = memoryStorage();
    expect(readRecentErrors("THCS", s)).toEqual([]);
    rememberRecentError("THCS", "L01", s);
    rememberRecentError("THCS", "L04", s);
    rememberRecentError("TH", "L02", s);
    expect(readRecentErrors("THCS", s)).toEqual(["L04", "L01"]);
    expect(readRecentErrors("TH", s)).toEqual(["L02"]);
    expect(JSON.parse(s.data.get(RECENT_ERRORS_KEY) ?? "{}")).toEqual({ THCS: ["L04", "L01"], TH: ["L02"] });
  });

  it("never throws when storage fails", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readRecentErrors("THCS", broken)).toEqual([]);
    expect(rememberRecentError("THCS", "L01", broken)).toEqual(["L01"]);
    expect(readRecentErrors("THCS", undefined)).toEqual([]);
  });
});

describe("student options", () => {
  const ds = makeFixtureDataset();

  it("lists only ACTIVE students of the class, by given name", () => {
    const list = activeStudentsOfClass(ds.students, "6A02");
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.classCode === "6A02" && s.status === "ACTIVE")).toBe(true);
    expect(list.some((s) => s.id === FIXTURE_STUDENT_IDS.long)).toBe(false); // transferred out
    expect(activeStudentsOfClass(ds.students, "")).toEqual([]);
  });

  it("sorts like a Vietnamese roster (given name first)", () => {
    const mk = (id: string, name: string): StudentLite => ({ id, name, classCode: "6A01", grade: 6, status: "ACTIVE" });
    const sorted = [mk("3", "Trần Văn Bình"), mk("1", "Nguyễn An"), mk("2", "Lê Thị An"), mk("4", "Đỗ Đức Anh")].sort(compareStudentsByGivenName);
    expect(sorted.map((s) => s.name)).toEqual(["Lê Thị An", "Nguyễn An", "Đỗ Đức Anh", "Trần Văn Bình"]);
  });

  it("searches by name without accents and by Mã HS", () => {
    const list = activeStudentsOfClass(ds.students, "6A01");
    expect(searchStudents(list, "truong phuc").map((s) => s.id)).toEqual([FIXTURE_STUDENT_IDS.truongPhuc6A01]);
    expect(searchStudents(list, FIXTURE_STUDENT_IDS.huy).map((s) => s.name)).toEqual(["Phạm Gia Huy"]);
    expect(searchStudents(list, "   ")).toHaveLength(list.length);
    expect(searchStudents(list, "khong co ai")).toEqual([]);
  });

  it("finds students named most often in the last 4 weeks", () => {
    const roster = activeStudentsOfClass(ds.students, "6A03");
    const top = frequentStudents(ds.incidents, roster, FIXTURE_TODAY);
    expect(top[0].student.id).toBe(FIXTURE_STUDENT_IDS.khoi);
    expect(top[0].count).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < top.length; k++) expect(top[k - 1].count).toBeGreaterThanOrEqual(top[k].count);
    // A window before any incident → nothing.
    expect(frequentStudents(ds.incidents, roster, "2026-08-20")).toEqual([]);
    expect(frequentStudents(ds.incidents, roster, FIXTURE_TODAY, { limit: 1 })).toHaveLength(1);
    expect(top.every((t) => t.count >= 2)).toBe(true);
    const all = frequentStudents(ds.incidents, roster, FIXTURE_TODAY, { minCount: 1, limit: 50 });
    expect(all.length).toBeGreaterThanOrEqual(top.length);
    expect(all.some((t) => t.count === 1)).toBe(true);
  });
});
