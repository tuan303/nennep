/**
 * Column sets for the "Xếp hạng" and "BC Học sinh" sheets (used by exportLevelWorkbook and the report exports).
 */
import { isRagStatus, RAG_SHORT, ragLabel, studentAlertLabel, top90Label, topGroupLabel } from "./format";
import { solidFill, XL_COLORS, type CellLook, type TableColumn } from "./sheet-writer";

/** One class of the ranking (engine RankingRow is structurally compatible). */
export interface RankingExportRow {
  grade: number;
  classCode: string;
  homeroomTeacher?: string;
  base: number;
  rewardPoints: number;
  penaltyPoints: number;
  score: number;
  rank: number;
  inTop90: boolean;
  rag: string; // RagStatus ("GREEN"…) or any display text
}

/** One student of the student report (built from engine StudentStat by the caller). */
export interface StudentExportRow {
  id: string;
  name: string;
  classCode: string;
  incidents: number;
  points: number;
  errors: string; // e.g. "Đi học muộn (2), Đồng phục (1)"
  alert: string; // "NONE" | "REPEAT" | "WEEKLY_RED" or display text
}

const RAG_COLORS: Record<string, string> = { GREEN: XL_COLORS.ok, YELLOW: XL_COLORS.warn, RED: XL_COLORS.bad, GRAY: XL_COLORS.muted };

function ragLook(rag: string): CellLook | undefined {
  const color = RAG_COLORS[rag];
  return color ? { font: { bold: true, color: { argb: color } } } : undefined;
}

function ragCellText(rag: string): string {
  return isRagStatus(rag) ? `${RAG_SHORT[rag].icon} ${ragLabel(rag)}` : rag;
}

/** Ranking columns; the Top column follows config.top90Ratio (`ratio`, default 0.9). */
export function rankingColumns(ratio?: number): ReadonlyArray<TableColumn<RankingExportRow>> {
  return [
  { header: "Khối", width: 8, kind: "center", value: (r) => r.grade },
  { header: "Lớp", width: 10, kind: "center", value: (r) => r.classCode, look: () => ({ font: { bold: true } }) },
  { header: "GVCN", width: 28, kind: "wrap", value: (r) => r.homeroomTeacher },
  { header: "Điểm nền", width: 11, kind: "number", value: (r) => r.base },
  { header: "Điểm thưởng", width: 12, kind: "number", value: (r) => r.rewardPoints },
  { header: "Điểm trừ", width: 11, kind: "number", value: (r) => r.penaltyPoints },
  { header: "Điểm thi đua", width: 13, kind: "number", value: (r) => r.score, look: () => ({ font: { bold: true } }) },
  { header: "Hạng", width: 8, kind: "center", value: (r) => r.rank },
  {
    header: topGroupLabel(ratio),
    width: 16,
    kind: "center",
    value: (r) => (r.inTop90 ? `★ ${top90Label(true, ratio)}` : top90Label(false, ratio)),
    look: (r) => (r.inTop90 ? { fill: solidFill(XL_COLORS.goldSoft), font: { bold: true } } : { font: { color: { argb: XL_COLORS.muted } } }),
  },
  { header: "Đánh giá (RAG)", width: 24, value: (r) => ragCellText(r.rag), look: (r) => ragLook(r.rag) },
  ];
}

/** Ranking columns with the spec default Top ratio (0.9). */
export const RANKING_COLUMNS: ReadonlyArray<TableColumn<RankingExportRow>> = rankingColumns();

export const STUDENT_REPORT_COLUMNS: ReadonlyArray<TableColumn<StudentExportRow>> = [
  { header: "Mã HS", width: 12, kind: "id", value: (s) => s.id },
  { header: "Họ và tên", width: 28, value: (s) => s.name },
  { header: "Lớp", width: 9, kind: "center", value: (s) => s.classCode },
  { header: "Số sự việc", width: 11, kind: "integer", value: (s) => s.incidents },
  { header: "Điểm trừ", width: 10, kind: "number", value: (s) => s.points },
  { header: "Lỗi vi phạm", width: 48, kind: "wrap", value: (s) => s.errors },
  {
    header: "Cảnh báo",
    width: 16,
    value: (s) => studentAlertLabel(s.alert),
    look: (s) => (s.alert === "WEEKLY_RED" ? { font: { bold: true, color: { argb: XL_COLORS.bad } } } : s.alert === "REPEAT" ? { font: { bold: true, color: { argb: XL_COLORS.warn } } } : undefined),
  },
];

/** Sort ranking rows by grade, rank, class code. */
export function sortRanking<T extends Pick<RankingExportRow, "grade" | "rank" | "classCode">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.grade - b.grade || a.rank - b.rank || a.classCode.localeCompare(b.classCode, "vi"));
}
