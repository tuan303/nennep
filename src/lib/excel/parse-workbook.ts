/**
 * parseNshmWorkbook – reads a legacy NSHM "nền nếp" workbook (TH / THCS / THPT layouts) or a workbook exported
 * by this app, and returns a normalised `WorkbookPayload` (validated with WorkbookPayloadSchema) + warnings.
 * No business rule is applied here: the server preview recomputes points, weeks, semesters and data checks.
 */
import { WorkbookPayloadSchema, type RosterRow, type WorkbookPayload } from "../contract";
import { ExcelParseError, readWorkbook, type BinaryInput } from "./loader";
import { detectLevel } from "./level-detect";
import { clip } from "./normalize";
import { buildCatalogIndex, INCIDENT_SHEET_NAMES, parseIncidents } from "./parse-incidents";
import { LINK_SHEET_NAMES, parseLinks } from "./parse-links";
import { SHEET_NAMES, parseCatalog, parseClasses, parseConfig, parseWeeks } from "./parse-reference";
import { parseRewards } from "./parse-rewards";
import { findRosterHeader, makeClassResolver, readRosterRows, type ClassResolver } from "./roster-rows";
import { findSheet, Warnings } from "./sheet-reader";
import type { Workbook } from "exceljs";

export interface ParseWorkbookResult {
  payload: WorkbookPayload;
  /** Vietnamese, row-referenced remarks ("Nhập liệu – dòng 12: …"); never blocking. */
  warnings: string[];
}

export const STUDENT_SHEET_NAMES = ["DS Học sinh", "Danh sách học sinh", "DS HS"] as const;

function parseStudents(wb: Workbook, resolveClass: ClassResolver, warn: Warnings): RosterRow[] {
  const ws = findSheet(wb, STUDENT_SHEET_NAMES);
  if (!ws) {
    warn.add(undefined, undefined, "Không tìm thấy trang “DS Học sinh”.");
    return [];
  }
  const header = findRosterHeader(ws);
  if (!header) {
    warn.add(ws.name, undefined, "Không tìm thấy dòng tiêu đề (Mã HS, Họ và tên, Lớp).");
    return [];
  }
  return readRosterRows(ws, header, warn, resolveClass);
}

function assertNshmWorkbook(wb: Workbook, fileName: string): void {
  const known = [
    INCIDENT_SHEET_NAMES,
    LINK_SHEET_NAMES,
    STUDENT_SHEET_NAMES,
    SHEET_NAMES.classes,
    SHEET_NAMES.catalog,
    SHEET_NAMES.weeks,
  ].filter((names) => findSheet(wb, names));
  if (known.length === 0) {
    throw new ExcelParseError(
      `File "${fileName}" không phải sổ nền nếp NSHM (không có trang “Nhập liệu”, “Danh mục”, “Bảng điểm lỗi”, “DS Học sinh”…).`,
    );
  }
}

function formatZodPath(path: ReadonlyArray<string | number>): string {
  return path.map((p) => (typeof p === "number" ? `[${p + 1}]` : `.${p}`)).join("").replace(/^\./, "");
}

/**
 * Parse an NSHM workbook. `buffer` may be an ArrayBuffer (browser `File.arrayBuffer()`), a Uint8Array or a Node Buffer.
 * Throws `ExcelParseError` (Vietnamese message) when the file is unreadable, is not an NSHM workbook or its level is unknown.
 */
export async function parseNshmWorkbook(buffer: BinaryInput, fileName: string): Promise<ParseWorkbookResult> {
  const wb = await readWorkbook(buffer, fileName);
  assertNshmWorkbook(wb, fileName);
  const warn = new Warnings();

  const classes = parseClasses(wb, warn);
  const catalog = parseCatalog(wb, warn);
  const config = parseConfig(wb, warn);
  const weeks = parseWeeks(wb, warn);
  const resolveClass = makeClassResolver(classes.map((c) => c.code));
  const students = parseStudents(wb, resolveClass, warn);
  const incidents = parseIncidents(wb, { resolveClass, catalog: buildCatalogIndex(catalog) }, warn);
  const incidentCodes = new Set(incidents.map((i) => i.code).filter(Boolean));
  const links = parseLinks(wb, { resolveClass, incidentCodes }, warn);
  const rewards = parseRewards(wb, { resolveClass }, warn);
  const levelId = detectLevel(wb, classes, fileName, warn);

  const payload: WorkbookPayload = {
    levelId,
    sourceFileName: clip(fileName.trim() || "workbook.xlsx", 300),
    classes,
    catalog,
    weeks,
    students,
    incidents,
    links,
    rewards,
  };
  if (config) payload.config = config;

  const parsed = WorkbookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? formatZodPath(first.path) : "";
    throw new ExcelParseError(`Dữ liệu trong file vượt giới hạn cho phép${where ? ` (${where})` : ""}: ${first?.message ?? "không hợp lệ"}.`);
  }
  return { payload: parsed.data, warnings: warn.list() };
}
