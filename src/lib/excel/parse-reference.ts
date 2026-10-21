/**
 * Reference sheets of an NSHM workbook: "Danh mục" (classes), "Bảng điểm lỗi" (catalog),
 * "Cấu hình" (config) and "Lịch tuần" (weeks).
 */
import type { Workbook } from "exceljs";
import type { ImportedCatalog, ImportedClass, ImportedConfig, ImportedWeek } from "../contract";
import type { Unit } from "../types";
import { mondayOf, monthOf } from "../engine/dates";
import { asIsoDate, asMonth, asNumber, asText, cellScalar, type Scalar } from "./cells";
import { clip, foldVN, headerKey } from "./normalize";
import { findHeader, findSheet, forEachDataRow, type FieldSpec, type Warnings } from "./sheet-reader";

export const SHEET_NAMES = {
  classes: ["Danh mục", "Danh mục lớp", "Danh sách lớp"],
  catalog: ["Bảng điểm lỗi", "Danh mục lỗi", "Bảng lỗi"],
  config: ["Cấu hình", "Cấu hình thi đua"],
  weeks: ["Lịch tuần", "Lịch tuần thi đua"],
} as const;

/* -------------------------------- classes --------------------------------- */

type ClassKey = "code" | "grade" | "system" | "homeroomTeacher" | "deputyTeacher" | "homeroomPhone" | "homeroomEmail" | "sourceSize";

const CLASS_FIELDS: FieldSpec<ClassKey>[] = [
  { key: "code", aliases: ["Lớp", "Mã lớp", "Tên lớp"], required: true },
  { key: "grade", aliases: ["Khối"] },
  { key: "system", aliases: ["Hệ", "Hệ lớp"] },
  { key: "homeroomTeacher", aliases: ["GVCN", "Giáo viên chủ nhiệm"] },
  { key: "deputyTeacher", aliases: ["Phó CN", "Phó chủ nhiệm", "PCN"] },
  { key: "homeroomPhone", aliases: ["SĐT GVCN", "SĐT", "Số điện thoại", "Điện thoại GVCN", "Điện thoại"] },
  { key: "homeroomEmail", aliases: ["Mail GVCN", "Email GVCN", "Email", "Mail"] },
  { key: "sourceSize", aliases: ["Sĩ số nguồn", "Sĩ số"] },
];

/** Grade from a number or text like "Khối 1" / "10". */
export function parseGrade(v: Scalar): number | undefined {
  const n = typeof v === "number" ? v : Number(/(\d{1,2})/.exec(asText(v))?.[1] ?? NaN);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

/** Grade from a class code: "6A0H" → 6, "10T0" → 10, "1B0" → 1. */
export function gradeFromClassCode(code: string): number | undefined {
  const m = /^(\d{1,2})/.exec(code.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : undefined;
}

function optionalText(value: string, max: number, label: string, warn: Warnings, sheet: string, row: number): string | undefined {
  if (!value) return undefined;
  if (value.length > max) warn.add(sheet, row, `${label} dài quá ${max} ký tự – đã cắt bớt.`);
  return clip(value, max);
}

export function parseClasses(wb: Workbook, warn: Warnings): ImportedClass[] {
  const ws = findSheet(wb, SHEET_NAMES.classes);
  if (!ws) {
    warn.add(undefined, undefined, "Không tìm thấy trang “Danh mục” (danh sách lớp).");
    return [];
  }
  const header = findHeader(ws, CLASS_FIELDS);
  if (!header) {
    warn.add(ws.name, undefined, "Không tìm thấy dòng tiêu đề có cột “Lớp”.");
    return [];
  }
  const out: ImportedClass[] = [];
  const seen = new Set<string>();
  forEachDataRow(ws, header, (row) => {
    const code = clip(row.text("code"), 20);
    const r = row.rowNumber;
    if (!code) {
      if (row.filled("homeroomTeacher") || row.filled("grade")) warn.add(ws.name, r, "Thiếu mã lớp – bỏ qua dòng.");
      return;
    }
    const grade = parseGrade(row.value("grade")) ?? gradeFromClassCode(code);
    if (grade === undefined) {
      warn.add(ws.name, r, `Không xác định được khối của lớp “${code}” – bỏ qua dòng.`);
      return;
    }
    if (seen.has(code)) {
      warn.add(ws.name, r, `Lớp ${code} bị lặp – chỉ lấy dòng đầu tiên.`);
      return;
    }
    seen.add(code);
    const item: ImportedClass = { code, grade };
    const system = optionalText(row.text("system"), 40, "Hệ", warn, ws.name, r);
    const gvcn = optionalText(row.text("homeroomTeacher"), 400, "GVCN", warn, ws.name, r);
    const deputy = optionalText(row.text("deputyTeacher"), 200, "Phó CN", warn, ws.name, r);
    const rawPhone = row.value("homeroomPhone");
    const phoneText = typeof rawPhone === "number" && /^\d{9}$/.test(asText(rawPhone)) ? "0" + asText(rawPhone) : asText(rawPhone);
    const phone = optionalText(phoneText, 30, "SĐT GVCN", warn, ws.name, r);
    const email = optionalText(row.text("homeroomEmail"), 120, "Mail GVCN", warn, ws.name, r);
    if (system) item.system = system;
    if (gvcn) item.homeroomTeacher = gvcn;
    if (deputy) item.deputyTeacher = deputy;
    if (phone) item.homeroomPhone = phone;
    if (email) item.homeroomEmail = email;
    if (row.filled("sourceSize")) {
      const size = asNumber(row.value("sourceSize"));
      if (size !== undefined && Number.isInteger(size) && size >= 0 && size <= 200) item.sourceSize = size;
      else warn.add(ws.name, r, `Sĩ số “${row.text("sourceSize")}” không hợp lệ – bỏ qua.`);
    }
    out.push(item);
  });
  return out;
}

/* -------------------------------- catalog --------------------------------- */

type CatalogKey = "code" | "category" | "issue" | "group" | "penalty" | "unit" | "displayName";

const CATALOG_FIELDS: FieldSpec<CatalogKey>[] = [
  { key: "code", aliases: ["Mã lỗi"], required: true },
  { key: "category", aliases: ["Mảng", "Mảng lỗi", "Lĩnh vực"] },
  { key: "issue", aliases: ["Nội dung lỗi", "Tên lỗi"], required: true },
  { key: "group", aliases: ["Nhóm lỗi", "Nhóm"] },
  { key: "penalty", aliases: ["Mức trừ", "Mức trừ điểm", "Điểm trừ"], required: true },
  { key: "unit", aliases: ["Đơn vị", "Đơn vị tính"], required: true },
  { key: "displayName", aliases: ["Lựa chọn lỗi", "Lựa chọn lỗi*", "Hiển thị"] },
];

/** "/HS", "HS", "điểm/HS", "/học sinh" → "/HS"; "/lần", "lần", "/lượt" → "/lần". */
export function parseUnit(text: string): Unit | undefined {
  const k = foldVN(text).replace(/\s+/g, "");
  if (/(^|\/)(hs|hocsinh)$/.test(k)) return "/HS";
  if (/(^|\/)(lan|luot)$/.test(k)) return "/lần";
  return undefined;
}

export function parseCatalog(wb: Workbook, warn: Warnings): ImportedCatalog[] {
  const ws = findSheet(wb, SHEET_NAMES.catalog);
  if (!ws) {
    warn.add(undefined, undefined, "Không tìm thấy trang “Bảng điểm lỗi”.");
    return [];
  }
  const header = findHeader(ws, CATALOG_FIELDS);
  if (!header) {
    warn.add(ws.name, undefined, "Không tìm thấy dòng tiêu đề (Mã lỗi, Nội dung lỗi, Mức trừ, Đơn vị).");
    return [];
  }
  const out: ImportedCatalog[] = [];
  const seen = new Set<string>();
  forEachDataRow(ws, header, (row) => {
    const r = row.rowNumber;
    const code = clip(row.text("code").toUpperCase(), 20);
    if (!code) {
      if (row.filled("issue")) warn.add(ws.name, r, "Thiếu mã lỗi – bỏ qua dòng.");
      return;
    }
    const issue = row.text("issue");
    const penalty = asNumber(row.value("penalty"));
    const unit = parseUnit(row.text("unit"));
    if (!issue) return warn.add(ws.name, r, `Lỗi ${code} thiếu nội dung – bỏ qua.`);
    if (penalty === undefined || penalty < 0 || penalty > 1000) return warn.add(ws.name, r, `Mức trừ của lỗi ${code} không hợp lệ – bỏ qua.`);
    if (!unit) return warn.add(ws.name, r, `Đơn vị “${row.text("unit")}” của lỗi ${code} không hợp lệ (cần /HS hoặc /lần) – bỏ qua.`);
    if (seen.has(code)) return warn.add(ws.name, r, `Mã lỗi ${code} bị lặp – chỉ lấy dòng đầu tiên.`);
    seen.add(code);
    const item: ImportedCatalog = {
      code,
      category: clip(row.text("category"), 200),
      issue: clip(issue, 500),
      penalty,
      unit,
    };
    const group = clip(row.text("group"), 60);
    const display = clip(row.text("displayName"), 600);
    if (group) item.group = group;
    if (display) item.displayName = display;
    out.push(item);
  });
  return out;
}

/* --------------------------------- config --------------------------------- */

const CONFIG_LABELS: Array<{ key: keyof ImportedConfig; prefixes: string[] }> = [
  { key: "baseScorePerWeek", prefixes: ["diem co so"] },
  { key: "firstWeek", prefixes: ["tuan dau"] },
  { key: "hk1Start", prefixes: ["hk1 bat dau", "hoc ky 1 bat dau", "hoc ky i bat dau"] },
  { key: "hk1End", prefixes: ["hk1 ket thuc", "hoc ky 1 ket thuc", "hoc ky i ket thuc"] },
  { key: "hk2Start", prefixes: ["hk2 bat dau", "hoc ky 2 bat dau", "hoc ky ii bat dau"] },
  { key: "hk2End", prefixes: ["hk2 ket thuc", "hoc ky 2 ket thuc", "hoc ky ii ket thuc"] },
];

/** "Cấu hình": label in column A, value in column B (any row). */
export function parseConfig(wb: Workbook, warn: Warnings): ImportedConfig | undefined {
  const ws = findSheet(wb, SHEET_NAMES.config);
  if (!ws) {
    warn.add(undefined, undefined, "Không tìm thấy trang “Cấu hình” – dùng cấu hình hiện có.");
    return undefined;
  }
  const config: ImportedConfig = {};
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    const label = headerKey(asText(cellScalar(row.getCell(1).value)));
    const spec = label ? CONFIG_LABELS.find((c) => c.prefixes.some((p) => label === p || label.startsWith(p + " "))) : undefined;
    if (!spec || config[spec.key] !== undefined) return;
    const value = cellScalar(row.getCell(2).value);
    if (spec.key === "baseScorePerWeek") {
      const n = asNumber(value);
      if (n !== undefined && n >= 0 && n <= 10000) config.baseScorePerWeek = n;
      else warn.add(ws.name, r, "Điểm cơ sở không hợp lệ – bỏ qua.");
      return;
    }
    let iso = asIsoDate(value);
    if (!iso) return warn.add(ws.name, r, `Ngày “${asText(value)}” không hợp lệ – bỏ qua.`);
    if (spec.key === "firstWeek" && mondayOf(iso) !== iso) {
      warn.add(ws.name, r, "Tuần đầu tính thi đua không phải Thứ Hai – đã lấy Thứ Hai của tuần đó.");
      iso = mondayOf(iso);
    }
    config[spec.key] = iso;
  });
  for (const [start, end, name] of [["hk1Start", "hk1End", "HK1"], ["hk2Start", "hk2End", "HK2"]] as const) {
    const s = config[start];
    const e = config[end];
    if (s && e && s > e) warn.add(ws.name, undefined, `Ngày bắt đầu ${name} sau ngày kết thúc – vui lòng kiểm tra.`);
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

/* ---------------------------------- weeks --------------------------------- */

type WeekKey = "weekStart" | "month" | "semester";

const WEEK_FIELDS: FieldSpec<WeekKey>[] = [
  { key: "weekStart", aliases: ["Tuần bắt đầu", "Ngày bắt đầu tuần", "Tuần", "Thứ Hai"], required: true },
  { key: "month", aliases: ["Tháng", "Tháng tuần"] },
  { key: "semester", aliases: ["Học kỳ", "HK"] },
];

export function parseWeeks(wb: Workbook, warn: Warnings): ImportedWeek[] {
  const ws = findSheet(wb, SHEET_NAMES.weeks);
  if (!ws) {
    warn.add(undefined, undefined, "Không tìm thấy trang “Lịch tuần”.");
    return [];
  }
  const header = findHeader(ws, WEEK_FIELDS);
  if (!header) {
    warn.add(ws.name, undefined, "Không tìm thấy dòng tiêu đề có cột “Tuần bắt đầu”.");
    return [];
  }
  const byWeek = new Map<string, ImportedWeek>();
  forEachDataRow(ws, header, (row) => {
    const r = row.rowNumber;
    if (!row.filled("weekStart")) return;
    const iso = asIsoDate(row.value("weekStart"));
    if (!iso) return warn.add(ws.name, r, `Ngày “${row.text("weekStart")}” không hợp lệ – bỏ qua.`);
    const monday = mondayOf(iso);
    if (monday !== iso) warn.add(ws.name, r, `${iso} không phải Thứ Hai – đã lấy ${monday}.`);
    if (byWeek.has(monday)) return warn.add(ws.name, r, `Tuần ${monday} bị lặp – chỉ lấy dòng đầu tiên.`);
    byWeek.set(monday, {
      weekStart: monday,
      month: asMonth(row.value("month")) || monthOf(monday),
      semester: clip(row.text("semester"), 10),
    });
  });
  return [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
