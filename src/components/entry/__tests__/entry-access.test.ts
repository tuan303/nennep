import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { UserProfile } from "@/lib/types";
import { entryEditAccess, levelOfRecordId } from "../lib/edit-access";
import { createdDayVN, myRecentIncidents, myTodaySummary, subjectSummary } from "../lib/recent";

const HOUR = 3_600_000;

function profile(role: UserProfile["role"], uid = "uid-editor-thcs"): UserProfile {
  return { uid, email: `${uid}@nshm.edu.vn`, displayName: "Nguyễn Văn Quang", role, levels: [], gvcnClasses: [], active: true, createdAt: "2026-08-01T00:00:00.000Z" };
}

const record = { levelId: "THCS" as const, classCode: "6A01", createdBy: "uid-editor-thcs", createdAt: "2026-10-21T01:00:00.000Z" };
const created = Date.parse(record.createdAt);

describe("edit permission window", () => {
  it("lets an editor edit own records within 24 hours", () => {
    const a = entryEditAccess(profile("EDITOR"), record, created + 2 * HOUR);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.timeLimited).toBe(true);
      expect(a.remainingMs).toBe(22 * HOUR);
    }
  });

  it("blocks editors after 24 hours and on other people's records, with a reason", () => {
    const late = entryEditAccess(profile("EDITOR"), record, created + 25 * HOUR);
    expect(late).toEqual({ ok: false, reason: expect.stringContaining("Đã quá 24 giờ") });
    const other = entryEditAccess(profile("EDITOR", "uid-other"), record, created + HOUR);
    expect(other).toEqual({ ok: false, reason: expect.stringContaining("do chính mình ghi nhận") });
  });

  it("lets admins edit any record at any time, never deleted ones", () => {
    const a = entryEditAccess(profile("ADMIN", "uid-admin"), record, created + 400 * HOUR);
    expect(a).toMatchObject({ ok: true, timeLimited: false });
    const deleted = entryEditAccess(profile("ADMIN", "uid-admin"), { ...record, deletedAt: "2026-10-21T02:00:00.000Z" }, created + HOUR);
    expect(deleted.ok).toBe(false);
  });

  it("viewers and GVCN cannot edit", () => {
    expect(entryEditAccess(profile("VIEWER", "uid-editor-thcs"), record, created).ok).toBe(false);
    expect(entryEditAccess(profile("GVCN", "uid-editor-thcs"), record, created).ok).toBe(false);
    expect(entryEditAccess(null, record, created).ok).toBe(false);
  });

  it("reads the level from a record doc id", () => {
    expect(levelOfRecordId("THCS_NN-20261021-0003")).toBe("THCS");
    expect(levelOfRecordId("TH_KT-20261021-0001")).toBe("TH");
    expect(levelOfRecordId("XYZ_NN-1")).toBeUndefined();
    expect(levelOfRecordId("")).toBeUndefined();
  });
});

describe("recent entries panel", () => {
  const ds = makeFixtureDataset();

  it("lists my incidents newest first, at most 15", () => {
    const mine = myRecentIncidents(ds.incidents, "uid-editor-thcs");
    expect(mine).toHaveLength(15);
    for (let k = 1; k < mine.length; k++) expect(mine[k - 1].createdAt >= mine[k].createdAt).toBe(true);
    expect(mine[0].date).toBe("2026-10-21");
    expect(myRecentIncidents(ds.incidents, "someone-else")).toEqual([]);
    expect(myRecentIncidents(ds.incidents, "")).toEqual([]);
  });

  it("skips soft-deleted records", () => {
    const list = ds.incidents.map((i, k) => (k === ds.incidents.length - 1 ? { ...i, deletedAt: "2026-10-21T05:00:00.000Z" } : i));
    expect(myRecentIncidents(list, "uid-editor-thcs").some((i) => i.deletedAt)).toBe(false);
  });

  it("counts what I recorded today (Vietnam time)", () => {
    const todays = ds.incidents.filter((i) => createdDayVN(i) === FIXTURE_TODAY);
    const sum = myTodaySummary(ds.incidents, "uid-editor-thcs", FIXTURE_TODAY);
    expect(sum.count).toBe(todays.length);
    expect(sum.count).toBeGreaterThan(0);
    expect(sum.points).toBe(todays.reduce((a, i) => a + i.points, 0));
    expect(createdDayVN({ createdAt: "2026-10-20T18:30:00.000Z" })).toBe("2026-10-21"); // 01:30 VN
    expect(createdDayVN({ createdAt: "bad" })).toBe("");
  });

  it("summarises who is involved", () => {
    const st = (name: string) => ({ id: name, name, classCode: "6A01" });
    expect(subjectSummary({ students: [], unnamedCount: 0, scope: "Tập thể" })).toBe("Tập thể lớp");
    expect(subjectSummary({ students: [st("An"), st("Bình"), st("Chi")], unnamedCount: 0, scope: "Tập thể" })).toBe("An, Bình +1");
    expect(subjectSummary({ students: [st("An")], unnamedCount: 2, scope: "Tập thể" })).toBe("An · 2 HS chưa rõ tên");
    expect(subjectSummary({ students: [], unnamedCount: 3, scope: "Tập thể" })).toBe("3 HS chưa rõ tên");
  });
});
