/**
 * parseRosterSheet – reads a student list (Mã HS / Mã học sinh, Họ và tên / Họ tên, Lớp, optional Ngày sinh,
 * Giới tính, Trạng thái) from any .xlsx: the first sheet whose header row (rows 1–10) has those columns.
 * Sheets named like "DS Học sinh" / "Danh sách học sinh" are tried first (legacy workbooks also contain
 * report sheets with similar columns); "HS liên quan" (incident links) is never treated as a roster.
 */
import type { Worksheet } from "exceljs";
import type { RosterRow } from "../contract";
import { ExcelParseError, readWorkbook, type BinaryInput } from "./loader";
import { headerKey } from "./normalize";
import { findRosterHeader, readRosterRows } from "./roster-rows";
import { Warnings } from "./sheet-reader";

export interface ParseRosterResult {
  rows: RosterRow[];
  sheetName: string;
  warnings: string[];
}

const PREFERRED = ["ds hoc sinh", "danh sach hoc sinh", "ds hs", "hoc sinh"];
const EXCLUDED = ["hs lien quan", "hoc sinh lien quan"];

function orderedCandidates(sheets: Worksheet[]): Worksheet[] {
  const usable = sheets.filter((ws) => !EXCLUDED.includes(headerKey(ws.name)) && ws.state !== "veryHidden");
  const rank = (ws: Worksheet): number => {
    const k = headerKey(ws.name);
    const i = PREFERRED.findIndex((p) => k === p || k.includes(p));
    return i === -1 ? PREFERRED.length : i;
  };
  return usable
    .map((ws, order) => ({ ws, order, rank: rank(ws) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((x) => x.ws);
}

/**
 * @param opts.sheetName read this sheet only (accent/case-insensitive name match)
 * @throws ExcelParseError when no sheet has the required columns
 */
export async function parseRosterSheet(buffer: BinaryInput, fileName: string, opts: { sheetName?: string } = {}): Promise<ParseRosterResult> {
  const wb = await readWorkbook(buffer, fileName);
  const candidates = opts.sheetName
    ? wb.worksheets.filter((ws) => headerKey(ws.name) === headerKey(opts.sheetName ?? ""))
    : orderedCandidates(wb.worksheets);
  for (const ws of candidates) {
    const header = findRosterHeader(ws);
    if (!header) continue;
    const warn = new Warnings();
    const rows = readRosterRows(ws, header, warn);
    if (rows.length === 0) warn.add(ws.name, undefined, "Không có dòng học sinh nào có Mã HS.");
    return { rows, sheetName: ws.name, warnings: warn.list() };
  }
  throw new ExcelParseError(
    opts.sheetName
      ? `Trang “${opts.sheetName}” trong file "${fileName}" không có đủ các cột Mã HS, Họ và tên, Lớp.`
      : `Không tìm thấy trang tính có đủ các cột Mã HS, Họ và tên, Lớp trong file "${fileName}".`,
  );
}
