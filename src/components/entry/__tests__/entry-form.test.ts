import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { buildIncidentCore } from "@/lib/engine";
import type { EntryForm } from "../lib/form-model";
import {
  defaultScopeForUnit,
  formFromIncident,
  freshEntryForm,
  newEntryForm,
  nextEntryForm,
  rememberClass,
  withClass,
  withErrorCode,
  withScope,
} from "../lib/form-model";
import { ENTRY_MSG, computeEntryPreview } from "../lib/preview";
import { payloadKey, requestFor, toIncidentCreateInput, toIncidentUpdateInput } from "../lib/payload";

const ds = makeFixtureDataset();
const today = FIXTURE_TODAY;
/** Roster ids of the fixture (see makeFixtureDataset). */
const s6A01 = (idx: number) => `260601${String(idx + 1).padStart(2, "0")}`;

function form(patch: Partial<EntryForm>): EntryForm {
  return { ...newEntryForm({ today, reporter: "Cô Lan" }), ...patch };
}

/** What the server would store for this form (same engine core the route handler uses). */
function serverCore(f: EntryForm) {
  const catalogItem = ds.catalog.find((c) => c.code === f.errorCode)!;
  const classInfo = ds.classes.find((c) => c.code === f.classCode)!;
  const input = toIncidentCreateInput(ds.levelId, f, catalogItem.unit);
  const students = (input.studentIds ?? []).map((id) => {
    const s = ds.students.find((x) => x.id === id)!;
    return { id: s.id, name: s.name, classCode: s.classCode };
  });
  return buildIncidentCore(
    { date: input.date, scope: input.scope, occurrenceCount: input.occurrenceCount, unnamedCount: input.unnamedCount },
    { catalogItem, classInfo, students, weeks: ds.weeks, semesters: ds.config.semesters },
  );
}

describe("entry form transitions", () => {
  it("defaults the scope from the error unit until the user picks one", () => {
    expect(defaultScopeForUnit("/HS")).toBe("Cá nhân");
    expect(defaultScopeForUnit("/lần")).toBe("Tập thể");
    let f = withErrorCode(form({}), "L10", "/lần");
    expect(f.scope).toBe("Tập thể");
    f = withErrorCode(f, "L01", "/HS");
    expect(f.scope).toBe("Cá nhân");
    f = withScope(f, "Tập thể");
    f = withErrorCode(f, "L02", "/HS");
    expect(f.scope).toBe("Tập thể");
  });

  it("clears students when the class changes (students belong to the class)", () => {
    const f = form({ classCode: "6A01", studentIds: [s6A01(0)], unnamedCount: 2 });
    expect(withClass(f, "6A01")).toBe(f);
    const g = withClass(f, "6A02");
    expect(g.classCode).toBe("6A02");
    expect(g.studentIds).toEqual([]);
    expect(g.unnamedCount).toBe(0);
  });

  it("'Lưu & nhập tiếp' keeps date, class and scope and clears the incident", () => {
    const f = withScope(
      form({ date: "2026-10-20", classCode: "6A03", errorCode: "L01", studentIds: ["x"], unnamedCount: 2, occurrenceCount: 3, detail: "abc", photoIds: ["p1"], links: ["https://a.vn"], status: "Đã đóng" }),
      "Tập thể",
    );
    const n = nextEntryForm(f);
    expect(n).toMatchObject({ date: "2026-10-20", classCode: "6A03", scope: "Tập thể", scopeTouched: true, reporter: "Cô Lan" });
    expect(n).toMatchObject({ errorCode: "", studentIds: [], unnamedCount: 0, occurrenceCount: 1, detail: "", photoIds: [], links: [], status: "Mới ghi nhận" });
  });

  it("'Lưu' starts a blank form for today, remembering the last class and the recorder", () => {
    const f = freshEntryForm(withScope(form({ date: "2026-10-19", classCode: "6A03", errorCode: "L01", studentIds: ["x"] }), "Tập thể"), today);
    expect(f).toEqual(newEntryForm({ today, reporter: "Cô Lan", classCode: "6A03" }));
  });

  it("remembers recent classes, most recent first", () => {
    expect(rememberClass(["6A01", "7A02"], "7A02")).toEqual(["7A02", "6A01"]);
    expect(rememberClass(["a", "b", "c", "d"], "e")).toEqual(["e", "a", "b", "c"]);
    expect(rememberClass(["a"], "")).toEqual(["a"]);
  });
});

describe("live preview + validation (engine rules)", () => {
  it("AC-004: 2 điểm/HS × 3 HS = 6 điểm, related students = 3", () => {
    const f = form({ classCode: "6A01", errorCode: "L01", scope: "Cá nhân", studentIds: [s6A01(0), s6A01(1), s6A01(2)] });
    const p = computeEntryPreview(ds, f, today);
    expect(p.canSave).toBe(true);
    expect(p.points).toBe(6);
    expect(p.relatedCount).toBe(3);
    expect(p.formula).toMatchObject({ unit: "/HS", penalty: 2, namedCount: 3, unnamedCount: 0 });
    const core = serverCore(f);
    expect(core.points).toBe(6);
    expect(core.relatedStudentCount).toBe(3);
  });

  it("AC-005: a /HS error without students cannot be saved and says why", () => {
    const personal = computeEntryPreview(ds, form({ classCode: "6A01", errorCode: "L01", scope: "Cá nhân" }), today);
    expect(personal.canSave).toBe(false);
    expect(personal.issues.join(" ")).toContain("cần ít nhất 1 học sinh");
    const collective = computeEntryPreview(ds, form({ classCode: "6A01", errorCode: "L01", scope: "Tập thể" }), today);
    expect(collective.canSave).toBe(false);
    expect(collective.issues).toContain("Lỗi tính theo học sinh (/HS) cần ít nhất 1 học sinh: chọn tên học sinh hoặc nhập số học sinh.");
  });

  it("AC-006: 5 điểm/lần × 1 = 5 điểm, students optional for Tập thể", () => {
    const f = withErrorCode(form({ classCode: "7A01" }), "L10", "/lần");
    const p = computeEntryPreview(ds, f, today);
    expect(p.canSave).toBe(true);
    expect(p.points).toBe(5);
    expect(serverCore(f).points).toBe(5);
    const three = computeEntryPreview(ds, { ...f, occurrenceCount: 3, studentIds: ["26070101"] }, today);
    expect(three.points).toBe(15); // never multiplied by students
  });

  it("unnamed students only count for /HS + Tập thể and flag THIẾU TÊN HS", () => {
    const collective = form({ classCode: "6A01", errorCode: "L01", scope: "Tập thể", studentIds: [s6A01(0)], unnamedCount: 2 });
    const p = computeEntryPreview(ds, collective, today);
    expect(p).toMatchObject({ canSave: true, points: 6, allowsUnnamed: true, flagsUnnamed: true, relatedCount: 3 });
    expect(serverCore(collective).dataCheck).toBe("THIEU_TEN_HS");
    expect(toIncidentCreateInput("THCS", collective, "/HS").unnamedCount).toBe(2);

    const personal = { ...collective, scope: "Cá nhân" as const };
    expect(computeEntryPreview(ds, personal, today)).toMatchObject({ points: 2, allowsUnnamed: false, flagsUnnamed: false });
    expect(toIncidentCreateInput("THCS", personal, "/HS").unnamedCount).toBe(0);

    const perOccurrence = { ...collective, errorCode: "L10" };
    expect(computeEntryPreview(ds, perOccurrence, today)).toMatchObject({ points: 5, allowsUnnamed: false });
    expect(toIncidentCreateInput("THCS", perOccurrence, "/lần").unnamedCount).toBe(0);
  });

  it("lists missing fields in friendly words instead of raw engine messages", () => {
    const p = computeEntryPreview(ds, form({ date: "" }), today);
    expect(p.issues.slice(0, 3)).toEqual([ENTRY_MSG.noDate, ENTRY_MSG.noClass, ENTRY_MSG.noError]);
    expect(p.issues.some((m) => m.includes('""'))).toBe(false);
    expect(p.points).toBe(0);
  });

  it("rejects future dates, students of another class and inactive students (AC-003 / FR-ENT-002)", () => {
    const future = computeEntryPreview(ds, form({ date: "2026-10-22", classCode: "6A01", errorCode: "L10" }), today);
    expect(future.issues).toContain("Không thể ghi nhận sự việc ở ngày trong tương lai.");
    const wrong = computeEntryPreview(ds, form({ classCode: "6A01", errorCode: "L01", studentIds: ["26070101"] }), today);
    expect(wrong.canSave).toBe(false);
    expect(wrong.issues.join(" ")).toContain("không thuộc lớp 6A01");
    const left = computeEntryPreview(ds, form({ classCode: "6A02", errorCode: "L01", studentIds: [FIXTURE_STUDENT_IDS.long] }), today);
    expect(left.issues.join(" ")).toContain("không còn ở trạng thái Đang học");
  });

  it("validates evidence links", () => {
    const p = computeEntryPreview(ds, form({ classCode: "7A01", errorCode: "L10", scope: "Tập thể", links: ["", "javascript:alert(1)", " https://drive.google.com/x "] }), today);
    expect(p.canSave).toBe(false);
    expect(p.issues).toEqual(["Liên kết minh chứng 2 chưa hợp lệ (cần bắt đầu bằng http:// hoặc https://)."]);
    expect(p.urls).toEqual(["https://drive.google.com/x"]);
  });

  it("edit mode keeps the stored catalog snapshot and the students already on the record", () => {
    const original = ds.incidents.find((i) => i.students.some((s) => s.id === FIXTURE_STUDENT_IDS.long))!;
    const f = formFromIncident(original);
    const p = computeEntryPreview(ds, f, today, original);
    expect(p.canSave).toBe(true); // Vũ Hoàng Long transferred out later, but stays valid on his old record
    expect(p.points).toBe(original.points);
    // A changed snapshot penalty is kept while the error code is unchanged.
    const snapshot = { ...original, penalty: 7 };
    expect(computeEntryPreview(ds, formFromIncident(snapshot), today, snapshot).points).toBe(7);
    // Switching to another class re-validates everyone.
    const moved = computeEntryPreview(ds, { ...f, classCode: "6A01" }, today, original);
    expect(moved.canSave).toBe(false);
  });
});

describe("payloads and idempotency", () => {
  it("builds the create payload with normalised counts, distinct students and trimmed text", () => {
    const f = form({ classCode: "6A01", errorCode: "L01", studentIds: [s6A01(0), s6A01(0), s6A01(1)], occurrenceCount: 4, detail: "  Đến muộn sau 7h15  ", reporter: "  ", links: [" https://a.vn ", ""] });
    expect(toIncidentCreateInput("THCS", f, "/HS")).toEqual({
      levelId: "THCS",
      date: today,
      classCode: "6A01",
      errorCode: "L01",
      scope: "Cá nhân",
      occurrenceCount: 1,
      studentIds: [s6A01(0), s6A01(1)],
      unnamedCount: 0,
      evidenceUrls: ["https://a.vn"],
      photoIds: [],
      status: "Mới ghi nhận",
      detail: "Đến muộn sau 7h15",
    });
  });

  it("update payload sends every editable field so cleared text is cleared", () => {
    const original = ds.incidents.find((i) => i.detail)!;
    const patch = toIncidentUpdateInput({ ...formFromIncident(original), detail: "  " }, original.unit, original);
    expect(patch.detail).toBe("");
    expect(patch).toHaveProperty("reporter");
    expect(patch).not.toHaveProperty("levelId");
  });

  it("INTEGRITY-6: update payload carries baseRev and sends the status only when the user changed it", () => {
    const original = { ...ds.incidents[0], rev: 3 };
    const unchanged = toIncidentUpdateInput(formFromIncident(original), original.unit, original);
    expect(unchanged.baseRev).toBe(3);
    expect(unchanged).not.toHaveProperty("status");
    const other = original.status === "Đã đóng" ? "Đang xử lý" : "Đã đóng";
    expect(toIncidentUpdateInput({ ...formFromIncident(original), status: other }, original.unit, original)).toMatchObject({ status: other, baseRev: 3 });
    const legacy = { ...ds.incidents[0], rev: undefined };
    expect(toIncidentUpdateInput(formFromIncident(legacy), legacy.unit, legacy).baseRev).toBe(0);
  });

  it("AC-018: re-uses the request id while retrying the same payload, new id after a change", () => {
    let n = 0;
    const gen = () => `req-${++n}`;
    const a = toIncidentCreateInput("THCS", form({ classCode: "6A01", errorCode: "L10" }), "/lần");
    const first = requestFor(null, payloadKey(a), gen);
    const retry = requestFor(first, payloadKey({ ...a }), gen);
    expect(retry.id).toBe(first.id);
    const changed = requestFor(retry, payloadKey({ ...a, occurrenceCount: 2 }), gen);
    expect(changed.id).not.toBe(first.id);
  });
});

describe("RULES-1: dates outside the school-week calendar", () => {
  const before = "2025-05-12"; // previous school year – not a calendar week of the fixture
  const outside = "Ngày 12/05/2025 không thuộc lịch tuần của năm học (Cài đặt → Lịch tuần).";

  it("blocks a new incident dated outside the calendar, like the server (400)", () => {
    expect(ds.weeks.some((w) => w.weekStart === before)).toBe(false);
    const p = computeEntryPreview(ds, form({ date: before, classCode: "6A01", errorCode: "L10", scope: "Tập thể" }), today);
    expect(p.canSave).toBe(false);
    expect(p.issues).toContain(outside);
    expect(computeEntryPreview(ds, form({ classCode: "6A01", errorCode: "L10", scope: "Tập thể" }), today).issues).not.toContain(outside);
  });

  it("never blocks an edit that keeps the stored date", () => {
    const original = { ...ds.incidents[0], date: before };
    const p = computeEntryPreview(ds, formFromIncident(original), today, original);
    expect(p.issues).not.toContain(outside);
  });
});
