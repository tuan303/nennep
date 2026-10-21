/**
 * Student roster rows (Mã HS, Họ và tên, Lớp, Ngày sinh, Giới tính, Trạng thái) – shared by
 * parseRosterSheet() and the "DS Học sinh" sheet of parseNshmWorkbook().
 *
 * Handles both legacy layouts: THCS = Lớp | Họ và tên học sinh | Mã HS | Trạng thái;
 * TH/THPT = Mã HS | Họ và tên | Ngày sinh | Lớp | Khối | Chọn học sinh. Student ids are always strings.
 */
import type { Worksheet } from "exceljs";
import type { RosterRow } from "../contract";
import { asIsoDate, asText } from "./cells";
import { clip } from "./normalize";
import { findHeader, forEachDataRow, type FieldSpec, type HeaderMatch, type Warnings } from "./sheet-reader";

export type RosterKey = "id" | "name" | "dob" | "gender" | "classCode" | "statusText";

export const ROSTER_FIELDS: FieldSpec<RosterKey>[] = [
  { key: "id", aliases: ["Mã HS", "Mã học sinh", "Mã số học sinh", "MSHS"], required: true },
  { key: "name", aliases: ["Họ và tên", "Họ tên", "Họ và tên học sinh", "Họ tên học sinh", "Tên học sinh"], required: true },
  { key: "dob", aliases: ["Ngày sinh", "Ngày tháng năm sinh"] },
  { key: "gender", aliases: ["Giới tính", "Giới"] },
  { key: "classCode", aliases: ["Lớp", "Lớp học", "Lớp HS", "Mã lớp", "Lớp hiện tại"], required: true },
  { key: "statusText", aliases: ["Trạng thái", "Tình trạng", "Trạng thái học tập"] },
];

/** Header of a roster sheet (rows 1–10) or undefined when the sheet is not a roster. */
export function findRosterHeader(ws: Worksheet): HeaderMatch<RosterKey> | undefined {
  return findHeader(ws, ROSTER_FIELDS, 10);
}

/** Maps a class code from a file to the canonical code of the class list (case/space-insensitive). */
export type ClassResolver = (raw: string) => string;

export function makeClassResolver(codes: readonly string[]): ClassResolver {
  const exact = new Set(codes);
  const loose = new Map<string, string>();
  for (const c of codes) loose.set(c.replace(/\s+/g, "").toUpperCase(), c);
  return (raw) => {
    const t = raw.trim();
    if (!t || exact.has(t)) return t;
    return loose.get(t.replace(/\s+/g, "").toUpperCase()) ?? t;
  };
}

const identity: ClassResolver = (raw) => raw.trim();

/** Read every roster row below the header. Rows without Mã HS are skipped; duplicate ids keep the first row. */
export function readRosterRows(ws: Worksheet, header: HeaderMatch<RosterKey>, warn: Warnings, resolveClass: ClassResolver = identity): RosterRow[] {
  const out: RosterRow[] = [];
  const seen = new Map<string, number>();
  forEachDataRow(ws, header, (row) => {
    const r = row.rowNumber;
    const id = row.text("id").replace(/\s+/g, "");
    const name = row.text("name").replace(/\s+/g, " ");
    const classCode = clip(resolveClass(row.text("classCode")), 20);
    if (!id) {
      if (name || classCode) warn.add(ws.name, r, `Thiếu Mã HS${name ? ` (${name})` : ""} – bỏ qua dòng.`);
      return;
    }
    if (id.length > 32) return warn.add(ws.name, r, `Mã HS “${id.slice(0, 40)}” quá dài – bỏ qua dòng.`);
    const first = seen.get(id);
    if (first !== undefined) return warn.add(ws.name, r, `Mã HS ${id} trùng với dòng ${first} – bỏ qua dòng này.`);
    seen.set(id, r);
    if (!name) warn.add(ws.name, r, `Học sinh mã ${id} thiếu họ tên.`);
    if (!classCode) warn.add(ws.name, r, `Học sinh mã ${id} thiếu lớp.`);
    const item: RosterRow = { rowNumber: r, id, name: clip(name, 120), classCode };
    if (row.filled("dob")) {
      const dob = asIsoDate(row.value("dob"));
      if (dob) item.dob = dob;
      else warn.add(ws.name, r, `Ngày sinh “${asText(row.value("dob"))}” của mã ${id} không hợp lệ – bỏ qua ngày sinh.`);
    }
    const gender = clip(row.text("gender"), 20);
    const status = clip(row.text("statusText"), 60);
    if (gender) item.gender = gender;
    if (status) item.statusText = status;
    out.push(item);
  });
  return out;
}
