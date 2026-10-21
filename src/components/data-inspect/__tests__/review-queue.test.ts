import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { ALL_PERIOD } from "@/lib/engine/period";
import { filterIncidents } from "@/lib/engine/filters";
import { activeStudentsOfClass } from "@/components/app/widgets/lib/student-options";
import type { Incident } from "@/lib/types";
import {
  canFixStudents,
  filterByIssue,
  fixChanged,
  fixPreview,
  fixUpdateInput,
  incidentIssueCodes,
  initialFixDraft,
  issueGroups,
  legacyNotes,
  legacySuggestions,
  namePartials,
  needsFullEdit,
  reviewQueue,
} from "../lib/review-queue";

const ds = makeFixtureDataset();
const all = filterIncidents(ds, { period: ALL_PERIOD });
const queue = reviewQueue(all);
const missing = all.find((i) => i.code === "NN-20261014-0002")!; // 7A03 L05 Tập thể, no students, legacy note
const ctx = { classes: ds.classes, students: ds.students, today: FIXTURE_TODAY };

describe("reviewQueue / issueGroups", () => {
  it("keeps REVIEW and THIẾU TÊN HS records, REVIEW first", () => {
    expect(queue).toHaveLength(6);
    expect(queue.slice(0, 3).every((i) => i.dataCheck === "REVIEW")).toBe(true);
    expect(queue.slice(3).every((i) => i.dataCheck === "THIEU_TEN_HS")).toBe(true);
    expect(queue[0].date >= queue[1].date).toBe(true);
  });

  it("groups by issue code in display order", () => {
    const groups = issueGroups(queue);
    expect(groups.map((g) => g.code)).toEqual(["MISSING_STUDENTS", "POINTS_MISMATCH_IMPORT", "UNNAMED_STUDENTS", "LEGACY_NOTE"]);
    expect(groups.find((g) => g.code === "POINTS_MISMATCH_IMPORT")?.count).toBe(2);
    expect(groups.find((g) => g.code === "UNNAMED_STUDENTS")?.count).toBe(3);
    expect(groups[0].meta.explanation).toContain("điểm đang là 0");
    expect(filterByIssue(queue, "LEGACY_NOTE").map((i) => i.code)).toEqual(["NN-20261014-0002"]);
    expect(filterByIssue(queue, "ALL")).toHaveLength(6);
  });

  it("falls back to OTHER for flagged records without issues", () => {
    expect(incidentIssueCodes({ dataCheck: "REVIEW", dataIssues: [] })).toEqual(["OTHER"]);
    expect(incidentIssueCodes({ dataCheck: "OK", dataIssues: [] })).toEqual([]);
  });
});

describe("legacy notes and name suggestions", () => {
  const withNote: Incident = {
    ...missing,
    classCode: "6A01",
    dataIssues: [{ code: "LEGACY_NOTE", message: "Ghi chú trong file cũ: Trường Phúc" }],
  };

  it("strips the legacy prefix", () => {
    expect(legacyNotes(withNote)).toEqual(["Trường Phúc"]);
    expect(legacyNotes(missing)).toEqual(["Nhập từ file cũ: chưa liên kết học sinh."]);
  });

  it("splits a note into name fragments", () => {
    expect(namePartials("Trường Phúc, Minh Khôi và Đạt")).toEqual(["Trường Phúc", "Minh Khôi", "Đạt"]);
    expect(namePartials("HS lớp 6A01")).toEqual([]);
  });

  it("suggests matching students of the class roster", () => {
    const roster = activeStudentsOfClass(ds.students, "6A01");
    const ids = legacySuggestions(withNote, roster).map((s) => s.id);
    expect(ids[0]).toBe(FIXTURE_STUDENT_IDS.truongPhuc6A01);
    expect(ids).not.toContain(FIXTURE_STUDENT_IDS.truongPhuc7A02);
    expect(legacySuggestions(missing, activeStudentsOfClass(ds.students, "7A03"))).toEqual([]);
  });
});

describe("Bổ sung học sinh quick fix", () => {
  it("applies to /HS records missing students only", () => {
    expect(canFixStudents(missing)).toBe(true);
    const mismatch = all.find((i) => i.code === "NN-20260922-0003")!;
    expect(canFixStudents(mismatch)).toBe(false);
    expect(needsFullEdit(mismatch)).toBe(true);
    expect(needsFullEdit(missing)).toBe(false);
    expect(canFixStudents({ ...missing, unit: "/lần" })).toBe(false);
  });

  it("previews points and data check with the engine rules", () => {
    const roster = activeStudentsOfClass(ds.students, "7A03");
    const named = fixPreview(missing, { studentIds: [roster[0].id, roster[1].id], unnamedCount: 0, scope: "Tập thể" }, ctx);
    expect(named).toMatchObject({ points: 4, dataCheck: "OK", errors: [] });

    const unnamed = fixPreview(missing, { studentIds: [], unnamedCount: 3, scope: "Tập thể" }, ctx);
    expect(unnamed).toMatchObject({ points: 6, dataCheck: "THIEU_TEN_HS", errors: [] });

    const empty = fixPreview(missing, { studentIds: [], unnamedCount: 0, scope: "Cá nhân" }, ctx);
    expect(empty.points).toBe(0);
    expect(empty.dataCheck).toBe("REVIEW");
    expect(empty.errors.length).toBeGreaterThan(0);

    const wrongClass = fixPreview(missing, { studentIds: [FIXTURE_STUDENT_IDS.khoi], unnamedCount: 0, scope: "Cá nhân" }, ctx);
    expect(wrongClass.errors.join(" ")).toContain("không thuộc lớp 7A03");
  });

  it("builds the PATCH body and detects changes", () => {
    const base = missing.rev ?? 0;
    expect(fixUpdateInput(missing, { studentIds: ["a"], unnamedCount: 2, scope: "Cá nhân" })).toEqual({ studentIds: ["a"], unnamedCount: 0, scope: "Cá nhân", baseRev: base });
    expect(fixUpdateInput(missing, { studentIds: [], unnamedCount: 2, scope: "Tập thể" })).toEqual({ studentIds: [], unnamedCount: 2, scope: "Tập thể", baseRev: base });
    expect(fixUpdateInput({ ...missing, rev: 4 }, { studentIds: [], unnamedCount: 0, scope: "Tập thể" }).baseRev).toBe(4);
    const draft = initialFixDraft(missing);
    expect(fixChanged(missing, draft)).toBe(false);
    expect(fixChanged(missing, { ...draft, unnamedCount: 1 })).toBe(true);
  });
});
