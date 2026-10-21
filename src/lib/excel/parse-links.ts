/**
 * "HS liên quan" sheet → ImportedLink[] (one row = one student linked to one incident).
 *
 * Layouts handled (columns located by header text):
 * - THCS legacy:   Mã sự việc | Lớp sự việc | Chọn học sinh (plain name) | Mã HS | Ghi chú | …
 * - TH/THPT legacy: Mã sự việc | Chọn học sinh = "NAME | CLASS | dd/mm/yyyy | ID" | Họ và tên | Ngày sinh | Lớp HS | Lớp sự việc | … | Mã HS
 * - Our export:    Mã sự việc | Lớp sự việc | Họ và tên | Mã HS | Lớp HS | Ghi chú
 */
import type { Workbook } from "exceljs";
import type { ImportedLink } from "../contract";
import { clip } from "./normalize";
import type { ClassResolver } from "./roster-rows";
import { findHeader, findSheet, forEachDataRow, type FieldSpec, type Warnings } from "./sheet-reader";

export const LINK_SHEET_NAMES = ["HS liên quan", "Học sinh liên quan"] as const;

type LinkKey = "incidentCode" | "incidentClass" | "choice" | "name" | "studentClass" | "studentId" | "note";

const LINK_FIELDS: FieldSpec<LinkKey>[] = [
  { key: "incidentCode", aliases: ["Mã sự việc", "Mã vụ việc"], required: true },
  { key: "incidentClass", aliases: ["Lớp sự việc"] },
  { key: "choice", aliases: ["Chọn học sinh", "Chọn học sinh*"] },
  { key: "name", aliases: ["Họ và tên", "Họ tên", "Họ và tên học sinh", "Tên học sinh"] },
  { key: "studentClass", aliases: ["Lớp HS", "Lớp học sinh"] },
  { key: "studentId", aliases: ["Mã HS", "Mã học sinh"] },
  { key: "note", aliases: ["Ghi chú"] },
];

const ID_RE = /^(?=.*\d)[A-Za-z0-9._-]{3,32}$/;

/** "NAME | CLASS | dd/mm/yyyy | ID" → parts (plain names → { name }). */
export function splitStudentChoice(choice: string): { name?: string; classCode?: string; id?: string } {
  const tokens = choice.split("|").map((t) => t.trim());
  if (tokens.length < 2) return choice.trim() ? { name: choice.trim() } : {};
  const last = tokens[tokens.length - 1];
  return {
    name: tokens[0] || undefined,
    classCode: tokens[1] || undefined,
    id: tokens.length >= 3 && ID_RE.test(last) ? last : undefined,
  };
}

export function parseLinks(wb: Workbook, ctx: { resolveClass: ClassResolver; incidentCodes: ReadonlySet<string> }, warn: Warnings): ImportedLink[] {
  const ws = findSheet(wb, LINK_SHEET_NAMES);
  if (!ws) {
    warn.add(undefined, undefined, "Không tìm thấy trang “HS liên quan” – sự việc sẽ không có học sinh liên quan.");
    return [];
  }
  const header = findHeader(ws, LINK_FIELDS);
  if (!header) {
    warn.add(ws.name, undefined, "Không tìm thấy dòng tiêu đề có cột “Mã sự việc”.");
    return [];
  }
  if (header.cols.choice === undefined && header.cols.name === undefined && header.cols.studentId === undefined) {
    warn.add(ws.name, undefined, "Không tìm thấy cột học sinh (Chọn học sinh / Họ và tên / Mã HS).");
    return [];
  }
  const sheet = ws.name;
  const out: ImportedLink[] = [];
  let orphanRows = 0;
  forEachDataRow(ws, header, (row) => {
    const r = row.rowNumber;
    const incidentCode = clip(row.text("incidentCode"), 40);
    if (!incidentCode) {
      if (row.filled("choice") || row.filled("name") || row.filled("studentId")) orphanRows++;
      return;
    }
    const parts = splitStudentChoice(row.text("choice"));
    const studentId = clip(row.text("studentId").replace(/\s+/g, "") || parts.id || "", 32);
    const studentName = clip((row.text("name") || parts.name || "").replace(/\s+/g, " "), 120);
    const studentClass = clip(ctx.resolveClass(row.text("studentClass") || parts.classCode || ""), 20);
    const note = clip(row.text("note"), 500);

    const link: ImportedLink = { rowNumber: r, incidentCode };
    if (studentId) link.studentId = studentId;
    if (studentName) link.studentName = studentName;
    if (studentClass) link.studentClass = studentClass;
    if (note) link.note = note;
    if (!studentId && !studentName) warn.add(sheet, r, `Sự việc ${incidentCode} có dòng học sinh trống.`);
    if (!ctx.incidentCodes.has(incidentCode)) warn.add(sheet, r, `Mã sự việc ${incidentCode} không có trong trang “Nhập liệu”.`);
    out.push(link);
  });
  if (orphanRows > 0) warn.add(sheet, undefined, `${orphanRows} dòng có học sinh nhưng thiếu Mã sự việc – đã bỏ qua.`);
  return out;
}
