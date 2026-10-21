/**
 * Column definitions of the data sheets written by exportLevelWorkbook. Headers deliberately reuse the legacy
 * NSHM names (Nhập liệu = legacy 24 columns A–X + Y "Số HS không rõ tên") so the exported file can be re-imported by parseNshmWorkbook.
 */
import { DATA_CHECK_LABELS, STUDENT_STATUS_LABELS } from "../constants";
import { addDays } from "../engine/dates";
import type { CatalogItem, ClassInfo, DataCheck, Incident, LevelConfig, Reward, SchoolWeek, StudentLite } from "../types";
import { isoToExcelDate } from "./cells";
import { catalogChoiceText } from "./format";
import { XL_COLORS, type CellInput, type CellLook, type TableColumn } from "./sheet-writer";

export interface IncidentRow {
  inc: Incident;
  cls?: ClassInfo;
}

const CHECK_LOOK: Record<DataCheck, CellLook | undefined> = {
  OK: { font: { color: { argb: XL_COLORS.ok } } },
  THIEU_TEN_HS: { font: { bold: true, color: { argb: XL_COLORS.warn } } },
  REVIEW: { font: { bold: true, color: { argb: XL_COLORS.bad } } },
};

export const INCIDENT_COLUMNS: ReadonlyArray<TableColumn<IncidentRow>> = [
  { header: "Mã sự việc", width: 19, value: ({ inc }) => inc.code },
  { header: "Ngày", width: 12, kind: "date", value: ({ inc }) => inc.date },
  { header: "Lớp", width: 9, kind: "center", value: ({ inc }) => inc.classCode, look: () => ({ font: { bold: true } }) },
  { header: "Chọn lỗi (nội dung)", width: 46, kind: "wrap", value: ({ inc }) => catalogChoiceText({ ...inc, code: inc.errorCode }) },
  { header: "Mảng", width: 20, kind: "wrap", value: ({ inc }) => inc.category },
  { header: "Nội dung lỗi", width: 34, kind: "wrap", value: ({ inc }) => inc.issue },
  { header: "Nhóm lỗi", width: 10, value: ({ inc }) => inc.group },
  { header: "Mức trừ", width: 9, kind: "number", value: ({ inc }) => inc.penalty },
  { header: "Đơn vị", width: 8, kind: "center", value: ({ inc }) => inc.unit },
  { header: "Số lần vi phạm", width: 10, kind: "integer", value: ({ inc }) => (inc.unit === "/lần" ? inc.occurrenceCount : null) },
  { header: "Số HS liên quan", width: 10, kind: "integer", value: ({ inc }) => inc.relatedStudentCount },
  { header: "Điểm trừ", width: 9, kind: "number", value: ({ inc }) => inc.points, look: () => ({ font: { bold: true } }) },
  { header: "Phạm vi", width: 10, value: ({ inc }) => inc.scope },
  { header: "Người ghi", width: 18, value: ({ inc }) => inc.reporter },
  { header: "Minh chứng", width: 30, kind: "wrap", value: ({ inc }) => inc.evidenceUrls.join("\n") },
  { header: "Trạng thái", width: 14, value: ({ inc }) => inc.status },
  { header: "Nội dung chi tiết", width: 40, kind: "wrap", value: ({ inc }) => inc.detail },
  { header: "Khối", width: 7, kind: "center", value: ({ inc }) => inc.grade },
  { header: "GVCN", width: 24, kind: "wrap", value: ({ cls }) => cls?.homeroomTeacher },
  { header: "Phó CN", width: 20, kind: "wrap", value: ({ cls }) => cls?.deputyTeacher },
  { header: "Tuần bắt đầu", width: 12, kind: "date", value: ({ inc }) => inc.week },
  { header: "Tháng tuần", width: 10, kind: "month", value: ({ inc }) => inc.month },
  { header: "Học kỳ", width: 8, kind: "center", value: ({ inc }) => inc.semester },
  { header: "Kiểm tra dữ liệu", width: 16, value: ({ inc }) => DATA_CHECK_LABELS[inc.dataCheck], look: ({ inc }) => CHECK_LOOK[inc.dataCheck] },
  { header: "Số HS không rõ tên", width: 10, kind: "integer", value: ({ inc }) => (inc.unnamedCount > 0 ? inc.unnamedCount : null) },
];

export interface LinkRow {
  incidentCode: string;
  incidentClass: string;
  name: string;
  id: string;
  classCode: string;
  note?: string;
}

export const LINK_COLUMNS: ReadonlyArray<TableColumn<LinkRow>> = [
  { header: "Mã sự việc", width: 19, value: (l) => l.incidentCode },
  { header: "Lớp sự việc", width: 11, kind: "center", value: (l) => l.incidentClass },
  { header: "Họ và tên", width: 28, value: (l) => l.name },
  { header: "Mã HS", width: 12, kind: "id", value: (l) => l.id },
  { header: "Lớp HS", width: 9, kind: "center", value: (l) => l.classCode },
  { header: "Ghi chú", width: 36, kind: "wrap", value: (l) => l.note },
];

export const STUDENT_COLUMNS: ReadonlyArray<TableColumn<StudentLite>> = [
  { header: "Mã HS", width: 12, kind: "id", value: (s) => s.id },
  { header: "Họ và tên", width: 30, value: (s) => s.name },
  { header: "Ngày sinh", width: 12, kind: "date", value: (s) => s.dob },
  { header: "Lớp", width: 9, kind: "center", value: (s) => s.classCode },
  { header: "Khối", width: 7, kind: "center", value: (s) => s.grade },
  {
    header: "Trạng thái",
    width: 18,
    value: (s) => STUDENT_STATUS_LABELS[s.status],
    look: (s) => (s.status === "ACTIVE" ? undefined : { font: { color: { argb: XL_COLORS.muted } } }),
  },
];

export interface ClassRow {
  cls: ClassInfo;
  activeStudents: number;
}

export const CLASS_COLUMNS: ReadonlyArray<TableColumn<ClassRow>> = [
  { header: "Lớp", width: 10, kind: "center", value: ({ cls }) => cls.code, look: () => ({ font: { bold: true } }) },
  { header: "Khối", width: 7, kind: "center", value: ({ cls }) => cls.grade },
  { header: "Hệ", width: 8, kind: "center", value: ({ cls }) => cls.system },
  { header: "GVCN", width: 30, kind: "wrap", value: ({ cls }) => cls.homeroomTeacher },
  { header: "Phó CN", width: 24, kind: "wrap", value: ({ cls }) => cls.deputyTeacher },
  { header: "SĐT GVCN", width: 14, kind: "id", value: ({ cls }) => cls.homeroomPhone },
  { header: "Mail GVCN", width: 32, value: ({ cls }) => cls.homeroomEmail },
  { header: "Sĩ số nguồn", width: 10, kind: "integer", value: ({ cls }) => cls.sourceSize },
  { header: "Sĩ số hiện tại", width: 10, kind: "integer", value: (r) => r.activeStudents },
  { header: "Trạng thái", width: 16, value: ({ cls }) => (cls.active ? "Đang hoạt động" : "Ngừng hoạt động") },
];

export const CATALOG_COLUMNS: ReadonlyArray<TableColumn<CatalogItem>> = [
  { header: "Mã lỗi", width: 9, kind: "center", value: (c) => c.code, look: () => ({ font: { bold: true } }) },
  { header: "Mảng", width: 22, kind: "wrap", value: (c) => c.category },
  { header: "Nội dung lỗi", width: 44, kind: "wrap", value: (c) => c.issue },
  { header: "Nhóm lỗi", width: 10, value: (c) => c.group },
  { header: "Mức trừ", width: 9, kind: "number", value: (c) => c.penalty },
  { header: "Đơn vị", width: 8, kind: "center", value: (c) => c.unit },
  { header: "Lựa chọn lỗi (hiển thị khi nhập)", width: 60, kind: "wrap", value: (c) => c.displayName || catalogChoiceText(c) },
  { header: "Tính 5S", width: 9, kind: "center", value: (c) => (c.is5S ? "Có" : "") },
  { header: "Trạng thái", width: 14, value: (c) => (c.active ? "Đang dùng" : "Ngừng dùng") },
];

export interface ConfigRow {
  label: string;
  value: CellInput;
  note?: string;
}

export const CONFIG_COLUMNS: ReadonlyArray<TableColumn<ConfigRow>> = [
  { header: "Tham số", width: 40, value: (r) => r.label, look: () => ({ font: { bold: true } }) },
  { header: "Giá trị", width: 24, value: (r) => r.value },
  { header: "Ghi chú", width: 60, kind: "wrap", value: (r) => r.note },
];

/** Rows of "Cấu hình": the first six are read back on import (labels must stay stable). */
export function configRows(config: LevelConfig): ConfigRow[] {
  const sem = (code: string, index: number) => config.semesters.find((s) => s.code === code) ?? config.semesters[index];
  const hk1 = sem("HK1", 0);
  const hk2 = sem("HK2", 1);
  const date = (iso: string | undefined): CellInput => (iso ? isoToExcelDate(iso) ?? iso : null);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const imported = "Được đọc lại khi nhập file.";
  const info = "Chỉ để tham khảo – chỉnh trong Cài đặt.";
  return [
    { label: "Điểm cơ sở / lớp / tuần", value: config.baseScorePerWeek, note: imported },
    { label: "Tuần đầu tính thi đua", value: date(config.firstWeek), note: imported },
    { label: "HK1 bắt đầu", value: date(hk1?.start), note: imported },
    { label: "HK1 kết thúc", value: date(hk1?.end), note: imported },
    { label: "HK2 bắt đầu", value: date(hk2?.start), note: imported },
    { label: "HK2 kết thúc", value: date(hk2?.end), note: imported },
    { label: "Năm học", value: config.schoolYear, note: info },
    { label: "Ngưỡng Vàng (điểm trừ TB/tuần)", value: config.rag.yellow, note: info },
    { label: "Ngưỡng Đỏ (điểm trừ TB/tuần)", value: config.rag.red, note: info },
    { label: "Ngưỡng RAG", value: config.rag.approved ? "Đã phê duyệt" : "Chưa phê duyệt", note: info },
    { label: "Độ tin cậy dữ liệu tối thiểu", value: pct(config.rag.minConfidence), note: info },
    { label: "Tỷ lệ Top 90%", value: pct(config.top90Ratio), note: info },
    { label: "Điểm thưởng được tính", value: config.rewardCountedStatuses.join(", "), note: info },
    { label: "Cảnh báo đỏ học sinh (lượt/tuần)", value: config.studentAlert.perWeek, note: info },
    {
      label: "Tái phạm",
      value: `≥ ${config.studentAlert.repeatMin} lượt trong ${config.studentAlert.repeatWindowWeeks} tuần`,
      note: info,
    },
  ];
}

export const WEEK_COLUMNS: ReadonlyArray<TableColumn<SchoolWeek>> = [
  { header: "Tuần bắt đầu", width: 13, kind: "date", value: (w) => w.weekStart },
  { header: "Tuần kết thúc", width: 13, kind: "date", value: (w) => addDays(w.weekStart, 6) },
  { header: "Tháng", width: 10, kind: "month", value: (w) => w.month },
  { header: "Học kỳ", width: 8, kind: "center", value: (w) => w.semester },
  {
    header: "Tính thi đua",
    width: 11,
    kind: "center",
    value: (w) => (w.counted ? "Có" : "Không"),
    look: (w) => (w.counted ? undefined : { font: { bold: true, color: { argb: XL_COLORS.warn } } }),
  },
  { header: "Ghi chú", width: 36, kind: "wrap", value: (w) => w.note },
];

export const REWARD_COLUMNS: ReadonlyArray<TableColumn<Reward>> = [
  { header: "Mã thưởng", width: 19, value: (r) => r.code },
  { header: "Ngày", width: 12, kind: "date", value: (r) => r.date },
  { header: "Lớp", width: 9, kind: "center", value: (r) => r.classCode, look: () => ({ font: { bold: true } }) },
  { header: "Nội dung", width: 44, kind: "wrap", value: (r) => r.reason },
  { header: "Điểm", width: 8, kind: "number", value: (r) => r.points, look: () => ({ font: { bold: true, color: { argb: XL_COLORS.ok } } }) },
  { header: "Người ghi", width: 18, value: (r) => r.reporter },
  { header: "Minh chứng", width: 30, kind: "wrap", value: (r) => r.evidenceUrls.join("\n") },
  { header: "Ghi chú", width: 30, kind: "wrap", value: (r) => r.note },
  { header: "Trạng thái", width: 15, value: (r) => r.status },
];
