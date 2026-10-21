import { describe, expect, it } from "vitest";
import type { Incident, StudentRef } from "../../types";
import { makeFixtureDataset } from "../__fixtures__/dataset";
import { V2_FIXTURE_IDS as V2, makeV2FixtureDataset } from "../__fixtures__/dataset-v2";
import { findPossibleDuplicates, isPossibleDuplicatePair, possibleDuplicatesOf } from "../duplicates";
import { integrityIssues } from "../integrity";
import { makeIncident } from "./builders";

const ds = makeV2FixtureDataset();
const byId = (id: string): Incident => {
  const found = ds.incidents.find((i) => i.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};
const A: StudentRef = { id: "HS0001", name: "Nguyễn Văn A", classCode: "6A01" };
const B: StudentRef = { id: "HS0002", name: "Trần Thị B", classCode: "6A01" };
const C: StudentRef = { id: "HS0003", name: "Lê Văn C", classCode: "6A01" };

/** Synthetic incident on 2026-10-12 in 6A01 (L01) with explicit id / students / creation time. */
function inc(id: string, students: StudentRef[], patch: Partial<Incident> = {}): Incident {
  return { ...makeIncident({ date: "2026-10-12", classCode: "6A01", students }), id, code: id, createdAt: `2026-10-12T01:00:0${id.slice(-1)}.000Z`, ...patch };
}

describe("isPossibleDuplicatePair", () => {
  it("same date + class + error with the same named students", () => {
    const a = byId(V2.dupNamedOf);
    const b = byId(V2.dupNamed);
    expect(isPossibleDuplicatePair(a, b)).toBe(true);
    expect(isPossibleDuplicatePair(b, a)).toBe(true);
    expect(isPossibleDuplicatePair(a, a)).toBe(false);
  });

  it("both without named students (/lần) is a possible duplicate too", () => {
    expect(isPossibleDuplicatePair(byId(V2.dupUnnamedOf), byId(V2.dupUnnamed))).toBe(true);
  });

  it("differs on date, class, error, deletion or students → not a pair", () => {
    const a = inc("X1", [A, B]);
    expect(isPossibleDuplicatePair(a, inc("X2", [B]))).toBe(true); // intersecting students
    expect(isPossibleDuplicatePair(a, inc("X2", [C]))).toBe(false); // disjoint students
    expect(isPossibleDuplicatePair(a, inc("X2", []))).toBe(false); // one side without names
    expect(isPossibleDuplicatePair(a, inc("X2", [A], { date: "2026-10-13" }))).toBe(false);
    expect(isPossibleDuplicatePair(a, inc("X2", [A], { classCode: "6A02" }))).toBe(false);
    expect(isPossibleDuplicatePair(a, inc("X2", [A], { errorCode: "L02" }))).toBe(false);
    expect(isPossibleDuplicatePair(a, inc("X2", [A], { deletedAt: "2026-10-12T05:00:00.000Z" }))).toBe(false);
    expect(isPossibleDuplicatePair(inc("X1", [A], { deletedAt: "2026-10-12T05:00:00.000Z" }), inc("X2", [A]))).toBe(false);
    expect(isPossibleDuplicatePair(inc("X1", []), inc("X2", []))).toBe(true);
  });

  it("a reviewed pair (either side lists the other in notDuplicateOf) is never a pair", () => {
    const reviewed = byId(V2.reviewed);
    const of = byId(V2.reviewedOf);
    expect(isPossibleDuplicatePair(reviewed, of)).toBe(false);
    expect(isPossibleDuplicatePair(of, reviewed)).toBe(false);
    expect(isPossibleDuplicatePair({ ...reviewed, notDuplicateOf: undefined }, of)).toBe(true);
    expect(isPossibleDuplicatePair(inc("X1", [A]), inc("X2", [A], { notDuplicateOf: ["X9"] }))).toBe(true);
  });
});

describe("possibleDuplicatesOf (entry form)", () => {
  const han = byId(V2.dupNamedOf).students[0];

  it("lists the existing matches of a draft, newest first", () => {
    const draft = { date: "2026-10-20", classCode: "6A01", errorCode: "L01", studentIds: [han.id] };
    expect(possibleDuplicatesOf(ds.incidents, draft).map((i) => i.id)).toEqual([V2.dupNamed, V2.dupNamedOf]);
    expect(possibleDuplicatesOf(ds.incidents, { ...draft, studentIds: [han.id, "HS0001"] })).toHaveLength(2);
    expect(possibleDuplicatesOf(ds.incidents, { ...draft, studentIds: ["HS0001"] })).toEqual([]);
    expect(possibleDuplicatesOf(ds.incidents, { ...draft, studentIds: [] })).toEqual([]);
    expect(possibleDuplicatesOf(ds.incidents, { ...draft, errorCode: "L02" })).toEqual([]);
  });

  it("excludeId leaves out the record being edited", () => {
    const draft = { date: "2026-10-20", classCode: "6A01", errorCode: "L01", studentIds: [han.id], excludeId: V2.dupNamed };
    expect(possibleDuplicatesOf(ds.incidents, draft).map((i) => i.id)).toEqual([V2.dupNamedOf]);
  });

  it("a draft without named students matches records without named students", () => {
    const draft = { date: "2026-10-16", classCode: "6A04", errorCode: "L14", studentIds: [] };
    expect(possibleDuplicatesOf(ds.incidents, draft).map((i) => i.id)).toEqual([V2.dupUnnamed, V2.dupUnnamedOf]);
  });

  it("pairs reviewed with the edited record are not reported; a new draft is not reviewed", () => {
    const draft = { date: "2026-09-10", classCode: "6A05", errorCode: "L14", studentIds: [] };
    expect(possibleDuplicatesOf(ds.incidents, draft).map((i) => i.id)).toEqual([V2.reviewed, V2.reviewedOf]);
    expect(possibleDuplicatesOf(ds.incidents, { ...draft, excludeId: V2.reviewed })).toEqual([]);
    expect(possibleDuplicatesOf(ds.incidents, { ...draft, excludeId: V2.reviewedOf })).toEqual([]);
  });

  it("an incomplete draft or a deleted record matches nothing", () => {
    expect(possibleDuplicatesOf(ds.incidents, { date: "", classCode: "6A01", errorCode: "L01", studentIds: [] })).toEqual([]);
    const deleted = ds.incidents.map((i) => (i.id === V2.dupNamed ? { ...i, deletedAt: "2026-10-21T01:00:00.000Z" } : i));
    expect(possibleDuplicatesOf(deleted, { date: "2026-10-20", classCode: "6A01", errorCode: "L01", studentIds: [han.id] }).map((i) => i.id)).toEqual([
      V2.dupNamedOf,
    ]);
  });
});

describe("findPossibleDuplicates (Dữ liệu → Có thể trùng)", () => {
  it("the base fixture has none", () => {
    expect(findPossibleDuplicates(makeFixtureDataset().incidents)).toEqual([]);
  });

  it("v2 fixture: two groups, newest date first, reviewed pair excluded", () => {
    const groups = findPossibleDuplicates(ds.incidents);
    expect(groups.map((g) => g.key)).toEqual([`2026-10-20|6A01|L01|${V2.dupNamedOf}`, `2026-10-16|6A04|L14|${V2.dupUnnamedOf}`]);
    expect(groups[0]).toMatchObject({ date: "2026-10-20", classCode: "6A01", errorCode: "L01", issue: "Đi học muộn", reason: "SAME_STUDENTS", extraPoints: 2 });
    expect(groups[0].incidents.map((i) => i.id)).toEqual([V2.dupNamedOf, V2.dupNamed]); // oldest first
    expect(groups[1]).toMatchObject({ reason: "NO_NAMED_STUDENTS", extraPoints: 2 });
    expect(groups.flatMap((g) => g.incidents.map((i) => i.id))).not.toContain(V2.reviewed);
  });

  it("connected components: a chain of pairs forms one group; extraPoints = Σ − max", () => {
    const x1 = inc("X1", [A], { points: 2 });
    const x2 = inc("X2", [A, B], { points: 4 });
    const x3 = inc("X3", [B], { points: 2 });
    const groups = findPossibleDuplicates([x3, x1, x2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].incidents.map((i) => i.id)).toEqual(["X1", "X2", "X3"]);
    expect(groups[0].key).toBe("2026-10-12|6A01|L01|X1");
    expect(groups[0].extraPoints).toBe(4);
    // Reviewing both links breaks the chain (X1 and X3 share no student).
    const broken = findPossibleDuplicates([x1, { ...x2, notDuplicateOf: ["X1", "X3"] }, x3]);
    expect(broken).toEqual([]);
    // A reviewed pair stays in the group when a third record links them.
    const linked = findPossibleDuplicates([x1, { ...x2, notDuplicateOf: ["X1"] }, { ...x3, students: [A, B] }]);
    expect(linked.map((g) => g.incidents.map((i) => i.id))).toEqual([["X1", "X2", "X3"]]);
  });

  it("orders groups by date desc, then class, and skips deleted records", () => {
    const groups = findPossibleDuplicates([
      inc("X1", [A], { classCode: "6A10" }),
      inc("X2", [A], { classCode: "6A10" }),
      inc("X3", [A], { classCode: "6A2" }),
      inc("X4", [A], { classCode: "6A2" }),
      inc("X5", [], { date: "2026-10-01" }),
      inc("X6", [], { date: "2026-10-01" }),
      inc("X7", [C]),
      inc("X8", [C], { deletedAt: "2026-10-12T05:00:00.000Z" }),
    ]);
    expect(groups.map((g) => [g.date, g.classCode])).toEqual([
      ["2026-10-12", "6A2"],
      ["2026-10-12", "6A10"],
      ["2026-10-01", "6A01"],
    ]);
  });
});

describe("integrityIssues", () => {
  it("base fixture: no defect; v2 fixture: the stored-points defect", () => {
    expect(integrityIssues(makeFixtureDataset().incidents)).toEqual([]);
    const issues = integrityIssues(ds.incidents);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "POINTS_FORMULA", expected: 5, actual: 10, message: "Điểm trừ lưu 10 khác công thức 5" });
    expect(issues[0].incident.id).toBe(V2.defect);
  });

  it("STUDENT_COUNT when relatedStudentCount ≠ named + unnamed", () => {
    const lan = { ...makeIncident({ date: "2026-10-12", classCode: "6A01", unit: "/lần", penalty: 5, points: 5 }), relatedStudentCount: 2 };
    const issues = integrityIssues([lan]);
    expect(issues.map((i) => i.kind)).toEqual(["STUDENT_COUNT"]);
    expect(issues[0]).toMatchObject({ expected: 0, actual: 2 });
    expect(issues[0].message).toBe("HS liên quan lưu 2 khác số thực tế 0 (0 ghi tên + 0 chưa rõ tên)");
    // "/HS": the formula follows the stored count, so both checks fire.
    const hs = { ...makeIncident({ date: "2026-10-12", classCode: "6A01", students: [A] }), relatedStudentCount: 3 };
    expect(integrityIssues([hs]).map((i) => [i.kind, i.expected, i.actual])).toEqual([
      ["POINTS_FORMULA", 6, 2],
      ["STUDENT_COUNT", 1, 3],
    ]);
  });

  it("STUDENT_CLASS unless the record already carries STUDENT_WRONG_CLASS", () => {
    const other: StudentRef = { id: "HS0009", name: "Phạm Văn D", classCode: "6A02" };
    const wrong = makeIncident({ date: "2026-10-12", classCode: "6A01", students: [A, other] });
    const issues = integrityIssues([wrong]);
    expect(issues.map((i) => i.kind)).toEqual(["STUDENT_CLASS"]);
    expect(issues[0].message).toBe("Phạm Văn D (6A02) không thuộc lớp 6A01 của sự việc");
    const flagged = { ...wrong, dataIssues: [{ code: "STUDENT_WRONG_CLASS" as const, message: "x" }] };
    expect(integrityIssues([flagged])).toEqual([]);
  });

  it("skips deleted records and sorts by date desc, then code", () => {
    const mk = (date: string, points: number) => makeIncident({ date, classCode: "6A01", students: [A], points });
    const a = mk("2026-10-05", 9);
    const b = mk("2026-10-12", 9);
    const c = mk("2026-10-12", 9);
    const d = { ...mk("2026-10-13", 9), deletedAt: "2026-10-13T05:00:00.000Z" };
    expect(integrityIssues([a, c, d, b]).map((i) => i.incident.id)).toEqual([b.id, c.id, a.id]);
  });
});
