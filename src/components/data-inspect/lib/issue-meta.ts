/**
 * Display metadata of data-quality issue codes (labels, explanations, how to fix). Pure – no React.
 * The classification itself (REVIEW / THIEU_TEN_HS / OK) always comes from the stored `dataCheck`.
 */
import type { DataIssueCode } from "@/lib/types";

/** How the review queue offers to fix an issue. */
export type IssueFix = "students" | "edit" | "info";
export type IssueTone = "bad" | "warn" | "brand";

export interface IssueMeta {
  /** Short title, e.g. "Thiếu học sinh". */
  label: string;
  /** One-sentence explanation for reviewers. */
  explanation: string;
  tone: IssueTone;
  fix: IssueFix;
}

export const ISSUE_META: Record<DataIssueCode, IssueMeta> = {
  MISSING_STUDENTS: {
    label: "Thiếu học sinh",
    explanation: "Lỗi tính theo HS nhưng chưa có học sinh – điểm đang là 0.",
    tone: "bad",
    fix: "students",
  },
  POINTS_MISMATCH_IMPORT: {
    label: "Lệch điểm khi nhập",
    explanation: "Điểm ghi trong file khác điểm tính theo quy định – hệ thống đang dùng điểm theo quy định.",
    tone: "bad",
    fix: "edit",
  },
  STUDENT_WRONG_CLASS: {
    label: "Học sinh khác lớp",
    explanation: "Học sinh được gắn không thuộc lớp của sự việc – cần kiểm tra lại lớp hoặc học sinh.",
    tone: "bad",
    fix: "edit",
  },
  STUDENT_NOT_FOUND: {
    label: "Không tìm thấy HS",
    explanation: "Tên hoặc mã học sinh trong file không có trong danh sách – liên kết đã bị bỏ qua.",
    tone: "bad",
    fix: "edit",
  },
  DUPLICATE_STUDENT: {
    label: "Học sinh bị trùng",
    explanation: "Một học sinh được gắn nhiều lần vào cùng sự việc.",
    tone: "bad",
    fix: "edit",
  },
  UNKNOWN_ERROR_CODE: {
    label: "Mã lỗi không rõ",
    explanation: "Mã lỗi không có trong bảng điểm lỗi hiện hành.",
    tone: "bad",
    fix: "edit",
  },
  UNKNOWN_CLASS: {
    label: "Lớp không rõ",
    explanation: "Lớp của sự việc không có trong danh mục lớp.",
    tone: "bad",
    fix: "edit",
  },
  INVALID_DATE: {
    label: "Ngày không hợp lệ",
    explanation: "Ngày ghi nhận không hợp lệ hoặc nằm ngoài lịch tuần.",
    tone: "bad",
    fix: "edit",
  },
  OTHER: {
    label: "Vấn đề khác",
    explanation: "Bản ghi có vấn đề cần người phụ trách kiểm tra.",
    tone: "bad",
    fix: "edit",
  },
  UNNAMED_STUDENTS: {
    label: "Thiếu tên HS",
    explanation: "Có học sinh chưa rõ tên – điểm vẫn được tính, nên bổ sung tên khi xác định được.",
    tone: "warn",
    fix: "students",
  },
  SCOPE_MISSING: {
    label: "Thiếu phạm vi",
    explanation: "File không ghi phạm vi (Cá nhân / Tập thể) – hệ thống đã gán mặc định.",
    tone: "warn",
    fix: "edit",
  },
  LEGACY_NOTE: {
    label: "Ghi chú file cũ",
    explanation: "Ghi chú từ cột “Kiểm tra dữ liệu” của file cũ – thông tin tham khảo khi rà soát.",
    tone: "brand",
    fix: "info",
  },
};

/** Display order: blocking issues first, informational last. */
export const ISSUE_ORDER: readonly DataIssueCode[] = [
  "MISSING_STUDENTS",
  "POINTS_MISMATCH_IMPORT",
  "STUDENT_WRONG_CLASS",
  "STUDENT_NOT_FOUND",
  "DUPLICATE_STUDENT",
  "UNKNOWN_ERROR_CODE",
  "UNKNOWN_CLASS",
  "INVALID_DATE",
  "OTHER",
  "UNNAMED_STUDENTS",
  "SCOPE_MISSING",
  "LEGACY_NOTE",
];

export function issueMeta(code: DataIssueCode): IssueMeta {
  return ISSUE_META[code] ?? ISSUE_META.OTHER;
}

export function compareIssueCodes(a: DataIssueCode, b: DataIssueCode): number {
  const ia = ISSUE_ORDER.indexOf(a);
  const ib = ISSUE_ORDER.indexOf(b);
  return (ia < 0 ? ISSUE_ORDER.length : ia) - (ib < 0 ? ISSUE_ORDER.length : ib);
}
