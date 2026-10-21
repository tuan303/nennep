import { describe, expect, it } from "vitest";
import type { StudentEvent } from "@/lib/types";
import { describeEvent, studentTimeline } from "../lib/timeline";

const ev = (e: Partial<StudentEvent> & Pick<StudentEvent, "type">): StudentEvent => ({ date: "2026-10-01", by: "admin@nshm.test", at: "2026-10-01T02:00:00.000Z", ...e });

describe("describeEvent", () => {
  it("titles each event type", () => {
    expect(describeEvent(ev({ type: "ENROLL", toClass: "6A01" }))).toEqual({ title: "Tuyển mới vào lớp 6A01", detail: undefined });
    expect(
      describeEvent(ev({ type: "TRANSFER_IN", fromLevel: "TH", toLevel: "THCS", fromClass: "5A1", toClass: "6A01", note: "Chuyển cấp từ Tiểu học (Đã tốt nghiệp)" })),
    ).toEqual({ title: "Chuyển cấp Tiểu học (lớp 5A1) → THCS, vào lớp 6A01", detail: "Chuyển cấp từ Tiểu học (Đã tốt nghiệp)" });
    expect(describeEvent(ev({ type: "TRANSFER_IN", toClass: "6A01", note: "Từ THCS Định Công" }))).toEqual({
      title: "Chuyển đến lớp 6A01",
      detail: "Từ THCS Định Công",
    });
    expect(describeEvent(ev({ type: "TRANSFER_CLASS", fromClass: "6A01", toClass: "6A02" })).title).toBe("Chuyển lớp 6A01 → 6A02");
    expect(describeEvent(ev({ type: "REINSTATE", fromClass: "6A01", toClass: "6A03" })).title).toBe("Khôi phục vào lớp 6A03");
    expect(describeEvent(ev({ type: "UPDATE", note: "Cập nhật: Họ tên" }))).toEqual({ title: "Cập nhật thông tin", detail: "Cập nhật: Họ tên" });
    expect(describeEvent(ev({ type: "IMPORT", toClass: "7A01", note: "Nhập từ danh sách học sinh" }))).toEqual({ title: "Nhập từ danh sách, lớp 7A01", detail: undefined });
    expect(describeEvent(ev({ type: "IMPORT", toClass: "7A01", note: "Nhập từ danh sách học sinh – Chuyển đến HKI" })).detail).toBe("Chuyển đến HKI");
  });

  it("splits the status label out of withdraw notes", () => {
    expect(describeEvent(ev({ type: "TRANSFER_OUT", fromClass: "6A02", note: "Đã chuyển trường – Trường THCS Hoàng Liệt – gia đình chuyển nhà" }))).toEqual({
      title: "Chuyển trường đi (lớp 6A02)",
      detail: "Trường THCS Hoàng Liệt – gia đình chuyển nhà",
    });
    expect(describeEvent(ev({ type: "TRANSFER_OUT", note: "Đã tốt nghiệp – Hoàn thành chương trình" }))).toEqual({
      title: "Tốt nghiệp",
      detail: "Hoàn thành chương trình",
    });
    expect(describeEvent(ev({ type: "TRANSFER_OUT", note: "Ngừng theo dõi" }))).toEqual({ title: "Ngừng theo dõi" });
    expect(describeEvent(ev({ type: "TRANSFER_OUT", fromClass: "6A01", note: "Không có trong danh sách import" }))).toEqual({
      title: "Chuyển trường đi (lớp 6A01)",
      detail: "Không có trong danh sách import",
    });
  });
});

describe("studentTimeline", () => {
  it("sorts newest first by effective date, then record time, and sets tones", () => {
    const items = studentTimeline([
      ev({ type: "ENROLL", toClass: "6A01", date: "2026-08-17", at: "2026-08-10T00:00:00.000Z" }),
      ev({ type: "UPDATE", date: "2026-10-01", at: "2026-10-01T01:00:00.000Z" }),
      ev({ type: "TRANSFER_CLASS", fromClass: "6A01", toClass: "6A02", date: "2026-10-01", at: "2026-10-01T03:00:00.000Z" }),
    ]);
    expect(items.map((i) => i.type)).toEqual(["TRANSFER_CLASS", "UPDATE", "ENROLL"]);
    expect(items.map((i) => i.tone)).toEqual(["star", "muted", "ok"]);
    expect(new Set(items.map((i) => i.key)).size).toBe(3);
  });

  it("returns [] for an empty history", () => {
    expect(studentTimeline([])).toEqual([]);
  });
});
