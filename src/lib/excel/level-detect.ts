/**
 * Level (Tiểu học / THCS / THPT) of a workbook: sheet titles first ("NHẬP LIỆU … – THCS",
 * "… (THPT)", "… TIỂU HỌC"), then the grades of its classes, then the file name.
 */
import type { Workbook } from "exceljs";
import type { ImportedClass } from "../contract";
import { LEVELS, levelOfGrade } from "../constants";
import type { LevelId } from "../types";
import { asText, cellScalar } from "./cells";
import { ExcelParseError } from "./loader";
import { headerKey } from "./normalize";
import { INCIDENT_SHEET_NAMES } from "./parse-incidents";
import { SHEET_NAMES } from "./parse-reference";
import { findSheet, type Warnings } from "./sheet-reader";

/** Level mentioned in a title text, e.g. "DANH MỤC LỚP TIỂU HỌC" → "TH", "… – TRUNG HỌC CƠ SỞ (THCS)" → "THCS". */
export function levelFromTitle(text: string): LevelId | undefined {
  const tagged = /\((TH|THCS|THPT)\)/i.exec(text);
  if (tagged) return tagged[1].toUpperCase() as LevelId;
  const f = ` ${headerKey(text)} `;
  if (f.includes(" tieu hoc ")) return "TH";
  if (f.includes(" trung hoc co so ") || f.includes(" thcs ")) return "THCS";
  if (f.includes(" trung hoc pho thong ") || f.includes(" thpt ")) return "THPT";
  return undefined;
}

/** Majority level of the class grades (1–5 TH, 6–9 THCS, 10–12 THPT). */
export function levelFromGrades(classes: readonly Pick<ImportedClass, "grade">[]): LevelId | undefined {
  const counts = new Map<LevelId, number>();
  for (const c of classes) {
    const l = levelOfGrade(c.grade);
    if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  let best: LevelId | undefined;
  for (const [l, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = l;
  return best;
}

/** "THCS.xlsx", "NenNep_THPT_2026.xlsx", "So nen nep Tieu hoc.xlsx" → level. */
export function levelFromFileName(fileName: string): LevelId | undefined {
  const k = ` ${headerKey(fileName)} `;
  if (k.includes(" thcs ")) return "THCS";
  if (k.includes(" thpt ")) return "THPT";
  if (k.includes(" th ") || k.includes(" tieu hoc ")) return "TH";
  return undefined;
}

function titleLevel(wb: Workbook): LevelId | undefined {
  const preferred = [findSheet(wb, INCIDENT_SHEET_NAMES), findSheet(wb, SHEET_NAMES.classes)];
  const sheets = [...preferred.filter((s) => s !== undefined), ...wb.worksheets];
  for (const ws of sheets) {
    for (const addr of ["A1", "A2"]) {
      const level = levelFromTitle(asText(cellScalar(ws.getCell(addr).value)));
      if (level) return level;
    }
  }
  return undefined;
}

export function detectLevel(wb: Workbook, classes: readonly ImportedClass[], fileName: string, warn: Warnings): LevelId {
  const byTitle = titleLevel(wb);
  const byGrades = levelFromGrades(classes);
  if (byTitle && byGrades && byTitle !== byGrades) {
    warn.add(undefined, undefined, `Tiêu đề file ghi ${LEVELS[byTitle].name} nhưng danh mục lớp thuộc ${LEVELS[byGrades].name} – vui lòng kiểm tra lại.`);
  }
  const level = byTitle ?? byGrades ?? levelFromFileName(fileName);
  if (!level) {
    throw new ExcelParseError(
      `Không xác định được cấp học của file "${fileName}". Tiêu đề trang “Nhập liệu” hoặc “Danh mục” cần ghi rõ Tiểu học, THCS hoặc THPT.`,
    );
  }
  if (!byTitle && !byGrades) warn.add(undefined, undefined, `Cấp học được đoán theo tên file: ${LEVELS[level].name}.`);
  return level;
}
