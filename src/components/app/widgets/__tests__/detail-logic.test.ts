import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { studentHistory } from "@/lib/engine/analytics";
import type { Incident, UserProfile } from "@/lib/types";
import {
  canDeleteIncident,
  canEditIncident,
  canGiveFeedback,
  canRestoreIncident,
  editWindowRemainingMs,
  formatRemaining,
  isIncidentRedacted,
} from "../lib/incident-access";
import { formulaInputOf, pointsFormula } from "../lib/points-formula";
import { buildStudentHistoryText, studentAlertDescription, studentErrorBreakdown, summarizeHistory } from "../lib/student-summary";
import { displayUrl, safeExternalUrl } from "../lib/urls";

const HOUR = 3_600_000;

function profile(over: Partial<UserProfile>): UserProfile {
  return { uid: "u1", email: "a@x.vn", displayName: "A", role: "EDITOR", levels: [], gvcnClasses: [], active: true, createdAt: "2026-08-01T00:00:00.000Z", ...over };
}

describe("points formula", () => {
  it("explains /HS points", () => {
    const f = pointsFormula({ unit: "/HS", penalty: 2, namedCount: 3, unnamedCount: 0, occurrenceCount: 1 });
    expect(f).toMatchObject({ text: "2 điểm × 3 HS = 6", total: 6, multiplier: 3, multiplierUnit: "HS" });
    expect(f.note).toBeUndefined();
  });

  it("mentions unnamed students", () => {
    const f = pointsFormula({ unit: "/HS", penalty: 2, namedCount: 2, unnamedCount: 3, occurrenceCount: 1 });
    expect(f.text).toBe("2 điểm × 5 HS = 10");
    expect(f.note).toBe("2 HS có tên + 3 HS chưa rõ tên");
  });

  it("explains /lần points (never multiplied by students)", () => {
    expect(pointsFormula({ unit: "/lần", penalty: 5, namedCount: 4, unnamedCount: 0, occurrenceCount: 2 }).text).toBe("5 điểm × 2 lần = 10");
    expect(pointsFormula({ unit: "/lần", penalty: 2.5, namedCount: 0, unnamedCount: 0, occurrenceCount: 0 }).text).toBe("2,5 điểm × 1 lần = 2,5");
  });

  it("uses the stored total when given", () => {
    expect(pointsFormula({ unit: "/HS", penalty: 2, namedCount: 1, unnamedCount: 0, occurrenceCount: 1 }, 4).text).toBe("2 điểm × 1 HS = 4");
  });

  it("derives the named count of redacted incidents from relatedStudentCount", () => {
    const input = formulaInputOf({ unit: "/HS", penalty: 2, students: [], unnamedCount: 1, occurrenceCount: 1, relatedStudentCount: 4 });
    expect(input).toMatchObject({ namedCount: 3, unnamedCount: 1 });
    expect(pointsFormula(input).text).toBe("2 điểm × 4 HS = 8");
  });

  it("matches every fixture incident's stored points", () => {
    for (const i of makeFixtureDataset().incidents) {
      expect(pointsFormula(formulaInputOf(i)).total).toBe(i.points);
    }
  });
});

describe("student history summary", () => {
  const ds = makeFixtureDataset();
  const khoi = ds.students.find((s) => s.id === FIXTURE_STUDENT_IDS.khoi);
  const huy = ds.students.find((s) => s.id === FIXTURE_STUDENT_IDS.huy);

  it("breaks a student's incidents down by error", () => {
    const history = studentHistory(ds, FIXTURE_STUDENT_IDS.khoi);
    const rows = studentErrorBreakdown(history);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(history.length);
    for (let k = 1; k < rows.length; k++) expect(rows[k - 1].count).toBeGreaterThanOrEqual(rows[k].count);
    expect(summarizeHistory(history)).toMatchObject({ incidents: history.length, errorTypes: rows.length });
  });

  it("never attributes /lần points to a student", () => {
    const history = studentHistory(ds, FIXTURE_STUDENT_IDS.huy);
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((i) => i.unit === "/lần")).toBe(true);
    expect(summarizeHistory(history).points).toBe(0);
  });

  it("builds a plain-text summary", () => {
    if (!khoi || !huy) throw new Error("fixture students missing");
    const history = studentHistory(ds, khoi.id);
    const text = buildStudentHistoryText({ student: khoi, periodText: "Toàn bộ năm học", history, alert: "WEEKLY_RED", config: ds.config });
    expect(text).toContain(`LỊCH SỬ NỀN NẾP – ${khoi.name}`);
    expect(text).toContain(`Mã HS: ${khoi.id} · Lớp: 6A03 · Đang học`);
    expect(text).toContain("Cảnh báo: Cảnh báo đỏ – Có từ 3 lượt vi phạm trở lên trong cùng một tuần");
    expect(text.split("\n").filter((l) => /^\d+\. /.test(l))).toHaveLength(history.length);

    const huyText = buildStudentHistoryText({ student: huy, periodText: "Tháng 10/2026", history: studentHistory(ds, huy.id), alert: "NONE", config: ds.config });
    expect(huyText).toContain("lỗi tính theo lần, lớp bị trừ");
    expect(huyText).not.toContain("Cảnh báo:");

    const empty = buildStudentHistoryText({ student: huy, periodText: "Tuần 17/08 – 23/08/2026", history: [], alert: "NONE", config: ds.config });
    expect(empty).toContain("Không có vi phạm trong phạm vi này.");
  });

  it("describes alerts from the thresholds", () => {
    expect(studentAlertDescription("REPEAT", ds.config)).toBe("Có từ 2 lượt vi phạm trở lên trong 4 tuần liên tiếp");
  });
});

describe("incident access", () => {
  const ds = makeFixtureDataset();
  const base: Incident = ds.incidents[0];
  const created = Date.parse(base.createdAt);
  const own: Incident = { ...base, createdBy: "u1" };

  it("lets ADMIN edit anything and EDITOR only own records within 24h", () => {
    expect(canEditIncident(profile({ role: "ADMIN", uid: "x" }), base, created + 1000 * HOUR)).toBe(true);
    expect(canEditIncident(profile({ role: "EDITOR" }), own, created + 23 * HOUR)).toBe(true);
    expect(canEditIncident(profile({ role: "EDITOR" }), own, created + 25 * HOUR)).toBe(false);
    expect(canEditIncident(profile({ role: "EDITOR", uid: "other" }), own, created + HOUR)).toBe(false);
    expect(canEditIncident(profile({ role: "VIEWER" }), own, created + HOUR)).toBe(false);
    expect(canEditIncident(profile({ role: "ADMIN" }), { ...own, deletedAt: "2026-10-20T00:00:00Z" }, created)).toBe(false);
    expect(canEditIncident(profile({ role: "ADMIN", active: false }), own, created)).toBe(false);
    expect(canEditIncident(undefined, own, created)).toBe(false);
  });

  it("formats the remaining edit window", () => {
    expect(editWindowRemainingMs(own, created + 19 * HOUR)).toBe(5 * HOUR);
    expect(formatRemaining(5 * HOUR)).toBe("còn 5 giờ");
    expect(formatRemaining(40 * 60_000)).toBe("còn 40 phút");
    expect(formatRemaining(0)).toBe("đã hết hạn");
    expect(editWindowRemainingMs({ createdAt: "bad" }, created)).toBe(0);
  });

  it("allows GVCN feedback only on own classes (and ADMIN)", () => {
    const gvcn = profile({ role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: base.classCode }] });
    const otherGvcn = profile({ role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "ZZ" }] });
    expect(canGiveFeedback(gvcn, base)).toBe(true);
    expect(canGiveFeedback(otherGvcn, base)).toBe(false);
    expect(canGiveFeedback(profile({ role: "ADMIN" }), base)).toBe(true);
    expect(canGiveFeedback(profile({ role: "EDITOR" }), base)).toBe(false);
    expect(canGiveFeedback(gvcn, { ...base, deletedAt: "2026-10-20T00:00:00Z" })).toBe(false);
  });

  it("allows delete/restore to ADMIN only", () => {
    const deleted = { ...base, deletedAt: "2026-10-20T00:00:00Z" };
    expect(canDeleteIncident(profile({ role: "ADMIN" }), base)).toBe(true);
    expect(canDeleteIncident(profile({ role: "EDITOR" }), base)).toBe(false);
    expect(canDeleteIncident(profile({ role: "ADMIN" }), deleted)).toBe(false);
    expect(canRestoreIncident(profile({ role: "ADMIN" }), deleted)).toBe(true);
    expect(canRestoreIncident(profile({ role: "ADMIN" }), base)).toBe(false);
  });

  it("detects redacted incidents for GVCN datasets", () => {
    const gvcn = profile({ role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] });
    const redactedDs = { ...ds, redacted: true };
    expect(isIncidentRedacted(redactedDs, { levelId: "THCS", classCode: "6A03" }, gvcn)).toBe(true);
    expect(isIncidentRedacted(redactedDs, { levelId: "THCS", classCode: "6A01" }, gvcn)).toBe(false);
    expect(isIncidentRedacted(ds, { levelId: "THCS", classCode: "6A03" }, gvcn)).toBe(false);
  });
});

describe("evidence urls", () => {
  it("only accepts http(s) links", () => {
    expect(safeExternalUrl(" https://drive.google.com/file/d/abc/view ")).toBe("https://drive.google.com/file/d/abc/view");
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("data:text/html,hi")).toBeUndefined();
    expect(safeExternalUrl("not a url")).toBeUndefined();
    expect(safeExternalUrl("")).toBeUndefined();
  });

  it("shortens links for display", () => {
    expect(displayUrl("https://www.example.com/a/b/")).toBe("example.com/a/b");
    expect(displayUrl("https://example.com/")).toBe("example.com");
    const long = displayUrl(`https://example.com/${"x".repeat(100)}`, 30);
    expect(long).toHaveLength(30);
    expect(long.endsWith("…")).toBe(true);
    expect(displayUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});
