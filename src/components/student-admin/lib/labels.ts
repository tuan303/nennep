/** Vietnamese labels and tones of the Quản lý học sinh screen (pure – unit-tested). */
import type { Tone } from "@/components/ui";
import type { StudentImportRowKind } from "@/lib/contract";
import { normalizeVN } from "@/lib/engine/text";
import type { StudentEvent, StudentStatus } from "@/lib/types";

/** Status filter of the roster: ACTIVE, every non-active status ("LEFT"), or everything. */
export type StatusFilter = "ACTIVE" | "LEFT" | "ALL";

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "ACTIVE", label: "Đang học" },
  { value: "LEFT", label: "Đã chuyển/nghỉ" },
  { value: "ALL", label: "Tất cả" },
];

/** Gender choice in forms ("none" = not provided). */
export type GenderChoice = "Nam" | "Nữ" | "none";

export const GENDER_OPTIONS: ReadonlyArray<{ value: GenderChoice; label: string }> = [
  { value: "Nam", label: "Nam" },
  { value: "Nữ", label: "Nữ" },
  { value: "none", label: "Chưa rõ" },
];

/** Map free text from records/imports ("nam", "NỮ", "") to a form choice. Unknown text → "none". */
export function genderChoiceOf(raw: string | undefined): GenderChoice {
  const n = normalizeVN(raw ?? "");
  if (n === "nam") return "Nam";
  if (n === "nu") return "Nữ";
  return "none";
}

/** Value sent to the API: "Nam" / "Nữ" / "" (clears on update; omitted on create). */
export function genderValue(choice: GenderChoice): string {
  return choice === "none" ? "" : choice;
}

/** Statuses a student can leave with (POST /withdraw). */
export type LeaveStatus = Exclude<StudentStatus, "ACTIVE">;

export const LEAVE_OPTIONS: ReadonlyArray<{ value: LeaveStatus; label: string; reasonLabel: string; reasonPlaceholder: string; confirm: string }> = [
  {
    value: "TRANSFERRED_OUT",
    label: "Chuyển trường",
    reasonLabel: "Nơi chuyển đến / lý do",
    reasonPlaceholder: "VD: Chuyển đến Trường THCS Hoàng Liệt theo nguyện vọng gia đình",
    confirm: "Xác nhận chuyển trường",
  },
  {
    value: "GRADUATED",
    label: "Tốt nghiệp",
    reasonLabel: "Ghi nhận",
    reasonPlaceholder: "VD: Hoàn thành chương trình năm học 2026–2027",
    confirm: "Xác nhận tốt nghiệp",
  },
  {
    value: "INACTIVE",
    label: "Ngừng theo dõi",
    reasonLabel: "Lý do",
    reasonPlaceholder: "VD: Nghỉ học dài hạn để điều trị sức khỏe",
    confirm: "Xác nhận ngừng theo dõi",
  },
];

export function leaveOption(status: LeaveStatus) {
  return LEAVE_OPTIONS.find((o) => o.value === status) ?? LEAVE_OPTIONS[0];
}

/** Kinds of a roster-import preview row (+ the sync-mode "missing" bucket). */
export type ImportTileKind = StudentImportRowKind | "MISSING";

export const IMPORT_KIND_META: Record<ImportTileKind, { label: string; tone: Tone; description: string }> = {
  NEW: { label: "Tuyển mới", tone: "ok", description: "Chưa có trong hệ thống – sẽ được thêm mới." },
  UPDATE: { label: "Cập nhật thông tin", tone: "brand", description: "Khác họ tên, ngày sinh hoặc giới tính." },
  TRANSFER: { label: "Chuyển lớp", tone: "star", description: "Lớp trong file khác lớp hiện tại." },
  REINSTATE: {
    label: "Quay lại",
    tone: "brand",
    description: "Đã chuyển/nghỉ (hoặc học ở cấp khác – chuyển cấp, giữ Mã HS) nhưng có trong file – sẽ trở lại Đang học.",
  },
  UNCHANGED: { label: "Không đổi", tone: "muted", description: "Thông tin trùng khớp, không cần cập nhật." },
  INVALID: { label: "Lỗi", tone: "bad", description: "Dòng bị bỏ qua: thiếu thông tin, sai lớp, trùng mã…" },
  MISSING: { label: "Không có trong file", tone: "warn", description: "Đang học nhưng không có trong file." },
};

/** Display order of the preview tiles. */
export const IMPORT_KIND_ORDER: readonly StudentImportRowKind[] = ["NEW", "UPDATE", "TRANSFER", "REINSTATE", "UNCHANGED", "INVALID"];

export const EVENT_META: Record<StudentEvent["type"], { label: string; tone: Tone }> = {
  ENROLL: { label: "Tuyển mới", tone: "ok" },
  TRANSFER_IN: { label: "Chuyển đến", tone: "ok" },
  TRANSFER_CLASS: { label: "Chuyển lớp", tone: "star" },
  TRANSFER_OUT: { label: "Chuyển trường đi", tone: "warn" },
  REINSTATE: { label: "Khôi phục", tone: "brand" },
  UPDATE: { label: "Cập nhật thông tin", tone: "muted" },
  IMPORT: { label: "Nhập từ danh sách", tone: "brand" },
};
