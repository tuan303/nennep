import { describe, expect, it } from "vitest";
import type { AuditAction } from "@/lib/types";
import { SUMMARY_MAX, diffRowsOf, fieldLabel, formatAuditValue, summarizeAudit } from "../lib/audit-summary";

const s = (action: AuditAction, detail?: Record<string, unknown>, ip?: string) => summarizeAudit({ action, detail, ip });

describe("summarizeAudit", () => {
  it("incidents: class · error · points (+ reason on delete)", () => {
    const d = { code: "NN-20261021-0001", date: "2026-10-21", classCode: "6A01", errorCode: "L04", points: 6, studentIds: ["1", "2", "3"], unnamedCount: 0 };
    expect(s("CREATE_INCIDENT", d)).toBe("6A01 · L04 · 6 điểm");
    expect(s("DELETE_INCIDENT", { ...d, reason: "Ghi nhầm lớp" })).toBe("6A01 · L04 · 6 điểm · Lý do: Ghi nhầm lớp");
    expect(s("RESTORE_INCIDENT", d)).toBe("6A01 · L04 · 6 điểm");
  });

  it("updates show what changed", () => {
    expect(s("UPDATE_INCIDENT", { code: "NN-1", changes: { points: { before: 4, after: 6 } } })).toBe("NN-1 · Điểm: 4 → 6");
    expect(s("UPDATE_INCIDENT", { code: "NN-1", changes: { points: { before: 4, after: 6 }, students: { before: [], after: [{ id: "1", name: "An", classCode: "6A01" }] } } })).toBe(
      "NN-1 · Đổi điểm, học sinh",
    );
    expect(s("UPDATE_ACTION", { code: "HD-1", changes: { status: { before: "Doing", after: "Done" }, evidence: { before: null, after: "Biên bản" } }, note: "Xong" })).toBe(
      "HD-1 · Trạng thái: Đang thực hiện → Hoàn thành (+1 mục) · “Xong”",
    );
    expect(s("UPDATE_USER", { email: "a@x.vn", changes: { role: { before: "VIEWER", after: "EDITOR" } } })).toBe("a@x.vn · Vai trò: Người xem → Cán bộ nền nếp");
  });

  it("rewards, students, imports, exports, auth", () => {
    expect(s("CREATE_REWARD", { classCode: "7A02", points: 5, reason: "Đạt giải văn nghệ" })).toBe("7A02 · +5 điểm · Đạt giải văn nghệ");
    expect(s("TRANSFER_STUDENT", { name: "Nguyễn An", from: "6A01", to: "6A02" })).toBe("Nguyễn An · 6A01 → 6A02");
    expect(s("WITHDRAW_STUDENT", { name: "Nguyễn An", classCode: "6A01", status: "TRANSFERRED_OUT" })).toBe("Nguyễn An · 6A01 · Đã chuyển trường");
    expect(s("IMPORT_EXCEL", { sourceFileName: "THCS.xlsx", created: { incidents: 120, students: 30 }, updated: { incidents: 2 } })).toBe(
      "THCS.xlsx · 150 mới · 2 cập nhật",
    );
    expect(s("EXPORT_EXCEL", { kind: "audit", rows: 1234 })).toBe("Nhật ký hệ thống · 1.234 dòng");
    expect(s("LOGIN_FAILED", { reason: "auth/wrong-password" }, "203.0.113.7")).toBe("Lý do: auth/wrong-password · IP 203.0.113.7");
    expect(s("LOGIN", undefined, "203.0.113.7")).toBe("IP 203.0.113.7");
    expect(s("UPDATE_CATALOG", { added: ["L40"], updated: [], deactivated: ["L05", "L06"] })).toBe("Thêm 1, ngừng dùng 2");
    expect(s("RESET_DATA", { batchId: "b1", incidents: 10, rewards: 2 })).toBe("Đặt lại cấp học · 10 sự việc · 2 điểm thưởng");
    expect(s("RESET_DATA", { purgeEvidence: true, deleted: 3, deletedBytes: 614400, relinked: 0, deletedIds: ["a"] })).toBe(
      "Dọn ảnh minh chứng không dùng · 3 ảnh đã xóa · 600 KB",
    );
    expect(s("TRANSFER_STUDENT", { name: "Học Sinh Mẫu", promoteLevel: true, fromLevel: "TH", toLevel: "THCS", from: "5A1", to: "6A01" })).toBe(
      "Học Sinh Mẫu · Chuyển cấp · TH 5A1 → THCS 6A01",
    );
    expect(s("UPLOAD_EVIDENCE", { mime: "image/jpeg", size: 204800 })).toBe("image/jpeg · 200 KB");
    expect(s("CREATE_ACTION", { code: "HD-20261021-001", title: "Kiểm tra 5S" })).toBe("HD-20261021-001 · Kiểm tra 5S");
  });

  it("v2: inspections, remediation, not-duplicate marks and GVCN proposals", () => {
    const ins = { code: "DKT-20261021-001", date: "2026-10-21", shift: "Sáng", classCodes: ["6A01", "6A02", "7A01"], inspector: "Nguyễn Văn A" };
    expect(s("CREATE_INSPECTION", { ...ins, category: "Nề nếp lớp học" })).toBe("DKT-20261021-001 · 21/10/2026 · 3 lớp · Nề nếp lớp học");
    expect(s("CREATE_INSPECTION", ins)).toBe("DKT-20261021-001 · 21/10/2026 · 3 lớp · Kiểm tra chung");
    expect(s("UPDATE_INSPECTION", { code: "DKT-20261021-001", changes: { inspector: { before: "A", after: "B" } } })).toBe("DKT-20261021-001 · Người kiểm tra: A → B");
    expect(s("DELETE_INSPECTION", { ...ins, reason: "Ghi nhầm ngày" })).toBe("DKT-20261021-001 · 21/10/2026 · 3 lớp · Kiểm tra chung · Lý do: Ghi nhầm ngày");
    expect(s("DELETE_INSPECTION", { code: "DKT-1", reason: "Nhầm" })).toBe("DKT-1 · Lý do: Nhầm");
    expect(s("GVCN_FEEDBACK", { code: "NN-1", classCode: "6A01", changes: { remediation: { before: null, after: "Nhắc nhở" } } })).toBe(
      "6A01 · NN-1 · Biện pháp khắc phục: – → Nhắc nhở",
    );
    expect(s("UPDATE_INCIDENT", { code: "NN-1", notDuplicate: ["NN-1", "NN-2"] })).toBe("NN-1 · Đánh dấu không trùng với NN-2");
    expect(s("CREATE_REWARD", { classCode: "6A01", points: 2, proposed: true, reason: "Lớp tích cực" })).toBe("6A01 · +2 điểm · GVCN đề xuất · Lớp tích cực");
    expect(s("EXPORT_EXCEL", { kind: "report", rows: 12 })).toBe("Báo cáo tuần/tháng · 12 dòng");
    expect(fieldLabel("earlyWarning")).toBe("Ngưỡng cảnh báo sớm");
  });

  it("report plans: report period · number of tasks (never the raw detail keys)", () => {
    expect(s("UPDATE_REPORT_PLAN", { mode: "week", key: "2026-10-19", items: 3 })).toBe("Báo cáo tuần 19/10 – 25/10/2026 · 3 công việc");
    expect(s("UPDATE_REPORT_PLAN", { mode: "month", key: "2026-10", items: 0 })).toBe("Báo cáo tháng 10/2026 · 0 công việc");
    expect(s("UPDATE_REPORT_PLAN", { mode: "week", key: "x", items: 2 })).toBe("2 công việc");
  });

  it("regulations: content or original PDF (the file name is never labelled 'Họ tên')", () => {
    expect(s("UPDATE_REGULATION", { part: "content", title: "Quy chế thử" })).toBe("Nội dung · Quy chế thử");
    expect(s("UPDATE_REGULATION", { part: "pdf", name: "ban-goc-thu.pdf", size: 204800 })).toBe("File PDF gốc · ban-goc-thu.pdf · 200 KB");
    expect(s("UPDATE_REGULATION", { part: "pdf", deleted: true, name: "ban-goc-thu.pdf" })).toBe("Xóa file PDF gốc · ban-goc-thu.pdf");
    expect(s("UPDATE_REGULATION", { other: "x" })).toBe("other: x");
  });

  it("is defensive and short", () => {
    expect(s("UPDATE_CONFIG")).toBe("");
    expect(s("REBUILD_DIGESTS", { incidents: 12, weeks: 5 })).toBe("incidents: 12 · weeks: 5");
    const long = s("CREATE_ACTION", { code: "HD-1", title: "x".repeat(400) });
    expect(long.length).toBe(SUMMARY_MAX);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("diffRowsOf", () => {
  it("reads { changes: { field: { before, after } } }", () => {
    expect(diffRowsOf({ code: "HD-1", changes: { deadline: { before: "2026-10-20", after: "2026-10-25" }, active: { before: true, after: false } } })).toEqual([
      { field: "deadline", label: "Hạn xử lý", before: "20/10/2026", after: "25/10/2026" },
      { field: "active", label: "Trạng thái tài khoản", before: "Có", after: "Không" },
    ]);
  });

  it("reads { before, after } objects (changed keys only)", () => {
    expect(diffRowsOf({ before: { a: 1, b: "x", c: [1] }, after: { a: 1, b: "y", c: [1], d: null } })).toEqual([{ field: "b", label: "b", before: "x", after: "y" }]);
  });

  it("returns undefined without a diff", () => {
    expect(diffRowsOf(undefined)).toBeUndefined();
    expect(diffRowsOf({ code: "x" })).toBeUndefined();
    expect(diffRowsOf({ changes: {} })).toBeUndefined();
  });
});

describe("formatAuditValue / fieldLabel", () => {
  it("formats values for humans", () => {
    expect(formatAuditValue(null)).toBe("–");
    expect(formatAuditValue("")).toBe("(trống)");
    expect(formatAuditValue(1234.5)).toBe("1.234,5");
    expect(formatAuditValue(["6A01", "6A02"])).toBe("6A01, 6A02");
    expect(formatAuditValue([{ id: "1", name: "An", classCode: "6A01" }])).toBe("An (6A01)");
    expect(formatAuditValue({ High: 3, Medium: 7 })).toBe("High: 3, Medium: 7");
    expect(formatAuditValue("High")).toBe("Cao");
  });

  it("labels fields", () => {
    expect(fieldLabel("owner")).toBe("Người phụ trách");
    expect(fieldLabel("owner", false)).toBe("người phụ trách");
    expect(fieldLabel("whatever")).toBe("whatever");
  });
});
