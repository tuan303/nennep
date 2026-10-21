import { describe, expect, it } from "vitest";
import type { CatalogItem, ClassInfo, StudentLite, StudentRef } from "../../types";
import { generateWeeks } from "../dates";
import { defaultLevelConfig } from "../../constants";
import { buildIncidentCore, computeDataCheck, computePoints, isReliable, validateIncidentRules } from "../scoring";

const config = defaultLevelConfig("THCS");
const weeks = generateWeeks(config.firstWeek, config.semesters);
const L01: CatalogItem = { code: "L01", category: "Chuyên cần – vệ sinh", issue: "Đi học muộn", penalty: 2, unit: "/HS", is5S: false, active: true };
const L10: CatalogItem = { code: "L10", category: "Học tập – truy bài", issue: "Không nộp sổ Nhật ký học tập", penalty: 5, unit: "/lần", is5S: false, active: true };
const cls: ClassInfo = { code: "7A01", levelId: "THCS", grade: 7, active: true, order: 0 };
const roster: StudentLite[] = [1, 2, 3].map((i) => ({ id: `S${i}`, name: `Học sinh ${i}`, classCode: "7A01", grade: 7, status: "ACTIVE" }));
const refs: StudentRef[] = roster.map((s) => ({ id: s.id, name: s.name, classCode: s.classCode }));
const ctx = { catalogItem: L01, classInfo: cls, studentsById: new Map(roster.map((s) => [s.id, s])), today: "2026-10-21" };

describe("AC-004 /HS points", () => {
  it("2 points/HS × 3 students = 6, relatedStudentCount = 3", () => {
    expect(computePoints({ unit: "/HS", penalty: 2, namedCount: 3, unnamedCount: 0, occurrenceCount: 1 })).toBe(6);
    const core = buildIncidentCore({ date: "2026-10-20", scope: "Tập thể" }, { catalogItem: L01, classInfo: cls, students: refs, weeks, semesters: config.semesters });
    expect(core.points).toBe(6);
    expect(core.relatedStudentCount).toBe(3);
    expect(core.dataCheck).toBe("OK");
    expect(core.week).toBe("2026-10-19");
    expect(core.month).toBe("2026-10");
    expect(core.semester).toBe("HK1");
  });
});

describe("AC-005 /HS without students is rejected", () => {
  it("returns a clear Vietnamese message", () => {
    const errors = validateIncidentRules({ date: "2026-10-20", classCode: "7A01", errorCode: "L01", scope: "Tập thể", studentIds: [] }, ctx);
    expect(errors).toContain("Lỗi tính theo học sinh (/HS) cần ít nhất 1 học sinh: chọn tên học sinh hoặc nhập số học sinh.");
  });
  it("Cá nhân without a named student is rejected too", () => {
    const errors = validateIncidentRules({ date: "2026-10-20", classCode: "7A01", errorCode: "L01", scope: "Cá nhân", studentIds: [] }, ctx);
    expect(errors).toContain("Phạm vi Cá nhân phải chọn học sinh liên quan.");
  });
  it("accepts a valid /HS incident", () => {
    expect(validateIncidentRules({ date: "2026-10-20", classCode: "7A01", errorCode: "L01", scope: "Tập thể", studentIds: ["S1", "S2"] }, ctx)).toEqual([]);
  });
});

describe("AC-006 /lần points", () => {
  it("5 points/lần × 1 = 5, never multiplied by students", () => {
    expect(computePoints({ unit: "/lần", penalty: 5, namedCount: 0, unnamedCount: 0, occurrenceCount: 1 })).toBe(5);
    const core = buildIncidentCore(
      { date: "2026-10-20", scope: "Tập thể", occurrenceCount: 1 },
      { catalogItem: L10, classInfo: cls, students: refs, weeks, semesters: config.semesters },
    );
    expect(core.points).toBe(5);
    const twice = buildIncidentCore({ date: "2026-10-20", scope: "Tập thể", occurrenceCount: 2 }, { catalogItem: L10, classInfo: cls, students: [], weeks, semesters: config.semesters });
    expect(twice.points).toBe(10);
  });
});

describe("unnamed students (NSHM decision)", () => {
  it("/HS + Tập thể with unnamed students is counted and flagged THIEU_TEN_HS", () => {
    const core = buildIncidentCore(
      { date: "2026-10-06", scope: "Tập thể", unnamedCount: 3 },
      { catalogItem: L01, classInfo: cls, students: refs.slice(0, 2), weeks, semesters: config.semesters },
    );
    expect(core.points).toBe(10);
    expect(core.relatedStudentCount).toBe(5);
    expect(core.dataCheck).toBe("THIEU_TEN_HS");
    expect(core.dataIssues.map((i) => i.code)).toContain("UNNAMED_STUDENTS");
    expect(isReliable(core.dataCheck)).toBe(true);
  });
  it("unnamed-only Tập thể incident passes validation", () => {
    expect(validateIncidentRules({ date: "2026-10-20", classCode: "7A01", errorCode: "L01", scope: "Tập thể", studentIds: [], unnamedCount: 2 }, ctx)).toEqual([]);
  });
  it("unnamedCount is ignored for Cá nhân and rejected for /lần", () => {
    const core = buildIncidentCore(
      { date: "2026-10-06", scope: "Cá nhân", unnamedCount: 3 },
      { catalogItem: L01, classInfo: cls, students: refs.slice(0, 1), weeks, semesters: config.semesters },
    );
    expect(core.unnamedCount).toBe(0);
    expect(core.points).toBe(2);
    const errors = validateIncidentRules(
      { date: "2026-10-20", classCode: "7A01", errorCode: "L10", scope: "Tập thể", studentIds: [], unnamedCount: 2 },
      { ...ctx, catalogItem: L10 },
    );
    expect(errors.some((e) => e.includes("không rõ tên"))).toBe(true);
  });
  it("/HS with no student at all is REVIEW with 0 points", () => {
    expect(computeDataCheck({ unit: "/HS", namedCount: 0, unnamedCount: 0 }).dataCheck).toBe("REVIEW");
    const core = buildIncidentCore({ date: "2026-10-06", scope: "Tập thể" }, { catalogItem: L01, classInfo: cls, students: [], weeks, semesters: config.semesters });
    expect(core.points).toBe(0);
    expect(core.dataCheck).toBe("REVIEW");
    expect(isReliable(core.dataCheck)).toBe(false);
  });
});
