import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import {
  buildUpdatePatch,
  defaultPromoteLevel,
  duplicateMessage,
  editFormOf,
  emptyAddForm,
  findDuplicateStudent,
  knownFieldErrors,
  validateAddForm,
  validatePromote,
  validateReinstate,
  validateTransfer,
  validateWithdraw,
  type AddForm,
} from "../lib/forms";
import { genderChoiceOf, genderValue, leaveOption } from "../lib/labels";

const ds = makeFixtureDataset();
const ctx = { levelId: "THCS" as const, students: ds.students, today: FIXTURE_TODAY };

function addForm(patch: Partial<AddForm> = {}): AddForm {
  return { ...emptyAddForm(FIXTURE_TODAY), id: "26069901", name: "  Nguyễn   Văn  An ", classCode: "6A01", ...patch };
}

describe("validateAddForm", () => {
  it("builds the create input (trimmed, optional fields omitted)", () => {
    const r = validateAddForm(addForm(), ctx);
    expect(r.errors).toEqual({});
    expect(r.value).toEqual({ levelId: "THCS", id: "26069901", name: "Nguyễn Văn An", classCode: "6A01", enrollDate: FIXTURE_TODAY, enrollType: "NEW" });
  });

  it("keeps dob, gender and note when given", () => {
    const r = validateAddForm(addForm({ dob: "2015-02-03", gender: "Nữ", note: " Chuyển từ HN ", enrollType: "TRANSFER_IN" }), ctx);
    expect(r.value).toMatchObject({ dob: "2015-02-03", gender: "Nữ", note: "Chuyển từ HN", enrollType: "TRANSFER_IN" });
  });

  it("reports required fields", () => {
    const r = validateAddForm({ ...emptyAddForm(FIXTURE_TODAY), enrollDate: "" }, ctx);
    expect(r.value).toBeUndefined();
    expect(r.errors).toEqual({
      id: "Nhập mã học sinh.",
      name: "Nhập họ và tên (ít nhất 2 ký tự).",
      classCode: "Chọn lớp.",
      enrollDate: "Chọn ngày nhập học.",
    });
    expect(validateAddForm({ ...addForm({ enrollType: "TRANSFER_IN", enrollDate: "" }) }, ctx).errors.enrollDate).toBe("Chọn ngày chuyển đến.");
  });

  it("rejects duplicates of the level (any status), spaces and future birthdays", () => {
    const long = ds.students.find((s) => s.id === FIXTURE_STUDENT_IDS.long)!;
    expect(validateAddForm(addForm({ id: ` ${long.id} ` }), ctx).errors.id).toBe(
      "Mã HS đã có: Vũ Hoàng Long (lớp 6A02 – Đã chuyển trường). Dùng “Khôi phục” nếu học sinh quay lại trường.",
    );
    expect(duplicateMessage(ds.students[0])).toMatch(/^Mã HS đã có: .+ \(lớp 6A0\d\)\.$/);
    expect(validateAddForm(addForm({ id: "26 06" }), ctx).errors.id).toBe("Mã HS không được chứa khoảng trắng.");
    expect(validateAddForm(addForm({ id: "x".repeat(33) }), ctx).errors.id).toBe("Mã HS tối đa 32 ký tự.");
    expect(validateAddForm(addForm({ dob: "2026-10-22" }), ctx).errors.dob).toBe("Ngày sinh không được sau hôm nay.");
    expect(validateAddForm(addForm({ note: "a".repeat(501) }), ctx).errors.note).toBe("Ghi chú tối đa 500 ký tự.");
  });

  it("emptyAddForm keeps type, class and date for “Lưu & thêm tiếp”", () => {
    const next = emptyAddForm(FIXTURE_TODAY, { enrollType: "TRANSFER_IN", classCode: "7A01", enrollDate: "2026-10-01" });
    expect(next).toEqual({ enrollType: "TRANSFER_IN", id: "", name: "", dob: "", gender: "none", classCode: "7A01", enrollDate: "2026-10-01", note: "" });
  });

  it("findDuplicateStudent matches the trimmed id exactly", () => {
    expect(findDuplicateStudent(ds.students, "")).toBeUndefined();
    expect(findDuplicateStudent(ds.students, ` ${FIXTURE_STUDENT_IDS.dat}`)?.name).toBe("Đỗ Văn Đạt");
  });
});

describe("buildUpdatePatch", () => {
  const before = { name: "Đỗ Văn Đạt", dob: "2014-01-01", gender: "nam", note: "Lớp trưởng" };

  it("reports no change for an untouched form", () => {
    const r = buildUpdatePatch(editFormOf(before), before, FIXTURE_TODAY);
    expect(r).toEqual({ errors: {}, changed: false, value: undefined });
    expect(editFormOf(before).gender).toBe("Nam");
  });

  it("sends changed fields only; empty gender / note clear them", () => {
    const r = buildUpdatePatch({ name: "Đỗ  Văn Đạt ", dob: "2014-02-02", gender: "none", note: "" }, before, FIXTURE_TODAY);
    expect(r.value).toEqual({ dob: "2014-02-02", gender: "", note: "" });
    expect(r.changed).toBe(true);
  });

  it("cannot clear a stored date of birth", () => {
    const r = buildUpdatePatch({ ...editFormOf(before), dob: "" }, before, FIXTURE_TODAY);
    expect(r.errors.dob).toBe("Không xóa được ngày sinh đã lưu – hãy nhập ngày đúng.");
    expect(r.value).toBeUndefined();
  });

  it("allows adding a dob when none was stored", () => {
    const r = buildUpdatePatch({ name: "An", dob: "2015-05-05", gender: "none", note: "" }, { name: "An" }, FIXTURE_TODAY);
    expect(r.value).toEqual({ dob: "2015-05-05" });
  });
});

describe("transfer / withdraw / reinstate", () => {
  it("validateTransfer", () => {
    expect(validateTransfer({ toClassCode: "", effectiveDate: FIXTURE_TODAY, note: "" }, "6A01").errors).toEqual({ toClassCode: "Chọn lớp mới." });
    expect(validateTransfer({ toClassCode: "6A01", effectiveDate: FIXTURE_TODAY, note: "" }, "6A01").errors.toClassCode).toBe("Học sinh đang ở lớp 6A01.");
    expect(validateTransfer({ toClassCode: "6A02", effectiveDate: FIXTURE_TODAY, note: " Theo đơn " }, "6A01").value).toEqual({
      toClassCode: "6A02",
      effectiveDate: FIXTURE_TODAY,
      note: "Theo đơn",
    });
  });

  it("validateWithdraw requires a reason", () => {
    expect(validateWithdraw({ status: "GRADUATED", date: FIXTURE_TODAY, reason: " ", note: "" }).errors).toEqual({ reason: "Nhập lý do / nơi chuyển đến." });
    expect(validateWithdraw({ status: "TRANSFERRED_OUT", date: "", reason: "Chuyển về quê", note: "" }).errors).toEqual({ date: "Chọn ngày." });
    expect(validateWithdraw({ status: "INACTIVE", date: FIXTURE_TODAY, reason: "Nghỉ   ốm dài ngày", note: "" }).value).toEqual({
      status: "INACTIVE",
      date: FIXTURE_TODAY,
      reason: "Nghỉ ốm dài ngày",
    });
  });

  it("validateReinstate", () => {
    expect(validateReinstate({ classCode: "", date: "2026-13-01", note: "" }).errors).toEqual({ classCode: "Chọn lớp.", date: "Ngày không hợp lệ." });
    expect(validateReinstate({ classCode: "6A02", date: FIXTURE_TODAY, note: "" }).value).toEqual({ classCode: "6A02", date: FIXTURE_TODAY });
  });

  it("knownFieldErrors keeps only form fields", () => {
    expect(knownFieldErrors({ id: "Trùng", levelId: "x" }, ["id", "name"] as const)).toEqual({ id: "Trùng" });
  });
});

describe("labels", () => {
  it("normalises gender text", () => {
    expect(genderChoiceOf("NỮ")).toBe("Nữ");
    expect(genderChoiceOf(" Nam ")).toBe("Nam");
    expect(genderChoiceOf("Khác")).toBe("none");
    expect(genderChoiceOf(undefined)).toBe("none");
    expect(genderValue("none")).toBe("");
  });
  it("leave options", () => {
    expect(leaveOption("GRADUATED").label).toBe("Tốt nghiệp");
  });
});

describe("INTEGRITY-9: chuyển cấp form", () => {
  it("defaults to the next level the user can open", () => {
    expect(defaultPromoteLevel("TH", ["TH", "THCS", "THPT"])).toBe("THCS");
    expect(defaultPromoteLevel("THCS", ["TH", "THCS", "THPT"])).toBe("THPT");
    expect(defaultPromoteLevel("THPT", ["TH", "THCS", "THPT"])).toBe("TH");
    expect(defaultPromoteLevel("TH", ["TH"])).toBeUndefined();
  });

  it("validates level, class and date", () => {
    const ok = validatePromote({ toLevelId: "THCS", classCode: "6A01", date: FIXTURE_TODAY, note: "  " }, "TH");
    expect(ok.value).toEqual({ toLevelId: "THCS", classCode: "6A01", date: FIXTURE_TODAY });
    const bad = validatePromote({ toLevelId: "TH", classCode: "", date: "", note: "" }, "TH");
    expect(bad.value).toBeUndefined();
    expect(Object.keys(bad.errors).sort()).toEqual(["classCode", "date", "toLevelId"]);
  });
});
