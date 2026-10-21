/**
 * Excel import/export (ExcelJS, Node + browser). ExcelJS itself is loaded lazily on first use.
 * Pages that only need the HTML snapshot can import "@/lib/excel/html-snapshot" directly.
 */
export { parseNshmWorkbook, STUDENT_SHEET_NAMES, type ParseWorkbookResult } from "./parse-workbook";
export { parseRosterSheet, type ParseRosterResult } from "./parse-roster";
export { exportLevelWorkbook, type ExportWorkbookOptions } from "./export-workbook";
export {
  exportSimpleSheet,
  exportRankingSheet,
  exportStudentList,
  exportGvcnReport,
  incidentSubjects,
  incidentStudentIds,
  type SimpleColumn,
  type SimpleRow,
  type SimpleSheetOptions,
  type ReportContext,
} from "./export-report";
export { buildHtmlSnapshot, escapeHtml, formatGeneratedAt, type HtmlSnapshotInput } from "./html-snapshot";
export type { RankingExportRow, StudentExportRow } from "./report-columns";
export { catalogChoiceText, penaltyUnitText, formatPenalty, ragLabel, top90Label, topGroupLabel, studentAlertLabel, RAG_SHORT } from "./format";
export { ExcelParseError, loadExcelJS, toArrayBuffer, toUint8Array, type BinaryInput } from "./loader";
export { extractErrorCode } from "./parse-incidents";
export { splitStudentChoice } from "./parse-links";
export { levelFromTitle, levelFromGrades, levelFromFileName } from "./level-detect";
export { foldVN, headerKey } from "./normalize";

/** MIME type for .xlsx downloads. */
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
