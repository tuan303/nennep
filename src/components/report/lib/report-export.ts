/**
 * "Xuất Excel chi tiết" and print file names of the weekly / monthly report (pure – unit-tested). The sheet carries
 * the identifiers required by REQ_V2 §5/§8: Mã sự việc, Mã lớp, Mã lỗi, Mã HS, plus remediation and GVCN feedback.
 */
import { SCHOOL_NAME } from "@/lib/constants";
import { formatDateVN } from "@/lib/engine/dates";
import type { PeriodReport, ReportDetailRow } from "./report-model";

/** Column shape of `exportSimpleSheet` (kept local so this module never loads ExcelJS). */
export interface ReportSheetColumn {
  header: string;
  key: keyof ReportSheetRow;
  width?: number;
}

export type ReportSheetRow = {
  date: string;
  code: string;
  classCode: string;
  errorCode: string;
  issue: string;
  group: string;
  scope: string;
  subjects: string;
  studentIds: string;
  turns: number;
  points: number;
  status: string;
  remediation: string;
  gvcnNote: string;
};

export const REPORT_SHEET_COLUMNS: readonly ReportSheetColumn[] = [
  { header: "Ngày", key: "date", width: 12 },
  { header: "Mã sự việc", key: "code", width: 20 },
  { header: "Lớp", key: "classCode", width: 9 },
  { header: "Mã lỗi", key: "errorCode", width: 9 },
  { header: "Nội dung lỗi", key: "issue", width: 40 },
  { header: "Nhóm", key: "group", width: 11 },
  { header: "Phạm vi", key: "scope", width: 10 },
  { header: "Đối tượng", key: "subjects", width: 32 },
  { header: "Mã HS", key: "studentIds", width: 20 },
  { header: "Lượt", key: "turns", width: 7 },
  { header: "Điểm", key: "points", width: 8 },
  { header: "Trạng thái", key: "status", width: 14 },
  { header: "Khắc phục", key: "remediation", width: 36 },
  { header: "Phản hồi GVCN", key: "gvcnNote", width: 36 },
];

/** Detail rows → sheet rows (already sorted by date then code). */
export function reportSheetRows(rows: readonly ReportDetailRow[]): ReportSheetRow[] {
  return rows.map((r) => ({
    date: r.date,
    code: r.code,
    classCode: r.classCode,
    errorCode: r.errorCode,
    issue: r.issue,
    group: r.group,
    scope: r.scope,
    subjects: r.subjects,
    studentIds: r.studentIds,
    turns: r.turns,
    points: r.points,
    status: r.status,
    remediation: r.remediation,
    gvcnNote: r.gvcnNote,
  }));
}

/** "Báo cáo nền nếp – Tuần 12/10 – 18/10/2026" (sheet title). */
export function reportSheetTitle(report: Pick<PeriodReport, "periodLabel">): string {
  return `Báo cáo nền nếp – ${report.periodLabel}`;
}

/** "Trường Ngôi Sao Hoàng Mai · Trung học cơ sở · Kính gửi: Tổ khối 6 · Xuất ngày 21/10/2026". */
export function reportSheetSubtitle(report: Pick<PeriodReport, "levelName" | "addressee">, today: string): string {
  return `${SCHOOL_NAME} · ${report.levelName} · Kính gửi: ${report.addressee} · Xuất ngày ${formatDateVN(today)}`;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s*–\s*/g, "_")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Base file name (no extension) – also the document title while printing, so "Lưu PDF" proposes it:
 * "NSHM_Bao-cao_THCS_Tuan-12-10_18-10-2026_Khoi-6".
 */
export function reportFileBase(report: Pick<PeriodReport, "levelId" | "periodLabel" | "scopeLabel">): string {
  return `NSHM_Bao-cao_${report.levelId}_${slug(report.periodLabel.replace(/\//g, "-"))}_${slug(report.scopeLabel)}`;
}
