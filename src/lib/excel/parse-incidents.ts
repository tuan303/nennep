/**
 * "Nhập liệu" sheet → ImportedIncident[]. One data row = one incident (a row where Ngày, Lớp or Chọn lỗi is filled).
 * Derived columns of the file (Mảng, Khối, GVCN, Tuần, Tháng, Học kỳ…) are ignored: the server recomputes them.
 */
import type { Workbook } from "exceljs";
import type { ImportedCatalog, ImportedIncident } from "../contract";
import { DATA_CHECK_LABELS } from "../constants";
import { compactDate } from "../engine/dates";
import { asIsoDate, asNumber, cellHyperlink, isFormulaCell } from "./cells";
import { clip, foldVN } from "./normalize";
import type { ClassResolver } from "./roster-rows";
import { findHeader, findSheet, forEachDataRow, type FieldSpec, type RowReader, type Warnings } from "./sheet-reader";

export const INCIDENT_SHEET_NAMES = ["Nhập liệu", "Sự việc", "Nhập liệu sự việc"] as const;

type IncidentKey =
  | "code"
  | "date"
  | "classCode"
  | "choice"
  | "errorCode"
  | "issue"
  | "occurrence"
  | "points"
  | "scope"
  | "reporter"
  | "evidence"
  | "status"
  | "detail"
  | "check"
  | "unnamed";

const INCIDENT_FIELDS: FieldSpec<IncidentKey>[] = [
  { key: "code", aliases: ["Mã sự việc", "Mã vụ việc"] },
  { key: "date", aliases: ["Ngày", "Ngày ghi nhận", "Ngày vi phạm", "Ngày xảy ra"], required: true },
  { key: "classCode", aliases: ["Lớp", "Lớp sự việc", "Mã lớp"], required: true },
  { key: "choice", aliases: ["Chọn lỗi", "Chọn lỗi vi phạm", "Lỗi vi phạm", "Lựa chọn lỗi", "Lỗi"], required: true },
  { key: "errorCode", aliases: ["Mã lỗi"] },
  { key: "issue", aliases: ["Nội dung lỗi", "Tên lỗi"] },
  { key: "occurrence", aliases: ["Số lần vi phạm", "Số lần", "Số lần vi phạm*"] },
  { key: "points", aliases: ["Điểm trừ", "Số điểm trừ", "Điểm trừ*"] },
  { key: "scope", aliases: ["Phạm vi", "Phạm vi*"] },
  { key: "reporter", aliases: ["Người ghi", "Người ghi nhận", "Người nhập"] },
  { key: "evidence", aliases: ["Minh chứng", "Minh chứng*", "Ảnh minh chứng"] },
  { key: "status", aliases: ["Trạng thái", "Trạng thái xử lý"] },
  { key: "detail", aliases: ["Nội dung chi tiết", "Chi tiết", "Mô tả", "Mô tả chi tiết"] },
  { key: "check", aliases: ["Kiểm tra dữ liệu", "Kiểm tra"] },
  { key: "unnamed", aliases: ["Số HS không rõ tên"] },
];

/** Standard values of the legacy "Kiểm tra dữ liệu" column (+ our own export labels); anything else is preserved as legacyCheckText. */
const STANDARD_CHECKS = new Set(
  ["OK", "THIẾU LỚP", "THIẾU LỖI", "THIẾU HS LIÊN QUAN", "THIẾU HS", ...Object.values(DATA_CHECK_LABELS)].map(foldVN),
);

const SCOPES: Record<string, string> = { "ca nhan": "Cá nhân", "tap the": "Tập thể" };
const INCIDENT_STATUSES: Record<string, string> = {
  "moi ghi nhan": "Mới ghi nhận",
  "dang xu ly": "Đang xử lý",
  "da dong": "Đã đóng",
};

/** Canonical spelling when the folded text matches a known value, else the original text. */
export function canonicalValue(text: string, known: Record<string, string>): string {
  return known[foldVN(text)] ?? text;
}

/** Last "Lxx" token of a choice text ("Giày dép để lộn xộn | Chuyên cần – vệ sinh | 2 điểm/HS | L04" → "L04"). */
export function extractErrorCode(choice: string): string | undefined {
  const tokens = choice.split("|").map((t) => t.trim());
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^L\d{1,3}$/i.test(tokens[i])) return tokens[i].toUpperCase();
  }
  const all = choice.match(/\bL\d{1,3}\b/gi);
  return all ? all[all.length - 1].toUpperCase() : undefined;
}

export interface CatalogIndex {
  codes: Set<string>;
  byIssue: Map<string, string>; // folded issue / display text → code
}

export function buildCatalogIndex(catalog: readonly ImportedCatalog[]): CatalogIndex {
  const byIssue = new Map<string, string>();
  for (const c of catalog) {
    if (c.displayName) byIssue.set(foldVN(c.displayName), c.code);
    if (!byIssue.has(foldVN(c.issue))) byIssue.set(foldVN(c.issue), c.code);
  }
  return { codes: new Set(catalog.map((c) => c.code)), byIssue };
}

/** "L4" → "L04" when only the padded form exists in the catalog. */
function canonicalCode(code: string, idx: CatalogIndex): string {
  if (idx.codes.has(code)) return code;
  const m = /^L(\d+)$/.exec(code);
  if (m) {
    const padded = `L${String(Number(m[1])).padStart(2, "0")}`;
    if (idx.codes.has(padded)) return padded;
  }
  return code;
}

/** Error code of a row: Lxx token of the choice → catalog match by issue text → "Mã lỗi" column. */
export function resolveErrorCode(choice: string, issueText: string, codeColumn: string, idx: CatalogIndex): string {
  const fromChoice = extractErrorCode(choice);
  if (fromChoice) return canonicalCode(fromChoice, idx);
  const candidates = [issueText, choice, choice.split("|")[0] ?? ""].map((t) => foldVN(t)).filter(Boolean);
  for (const c of candidates) {
    const code = idx.byIssue.get(c);
    if (code) return code;
  }
  return codeColumn ? canonicalCode(codeColumn.toUpperCase(), idx) : "";
}

function evidenceOf(row: RowReader<IncidentKey>): string {
  return cellHyperlink(row.cell("evidence")) ?? row.text("evidence");
}

function textField(row: RowReader<IncidentKey>, key: IncidentKey, max: number, label: string, warn: Warnings, sheet: string): string | undefined {
  const t = row.text(key);
  if (!t) return undefined;
  if (t.length > max) warn.add(sheet, row.rowNumber, `${label} dài quá ${max} ký tự – đã cắt bớt.`);
  return clip(t, max);
}

export function parseIncidents(wb: Workbook, ctx: { resolveClass: ClassResolver; catalog: CatalogIndex }, warn: Warnings): ImportedIncident[] {
  const ws = findSheet(wb, INCIDENT_SHEET_NAMES);
  if (!ws) {
    warn.add(undefined, undefined, "Không tìm thấy trang “Nhập liệu” – không có sự việc nào được đọc.");
    return [];
  }
  const header = findHeader(ws, INCIDENT_FIELDS);
  if (!header) {
    warn.add(ws.name, undefined, "Không tìm thấy dòng tiêu đề (Ngày, Lớp, Chọn lỗi).");
    return [];
  }
  const sheet = ws.name;
  const out: ImportedIncident[] = [];
  const codes = new Map<string, number>();
  forEachDataRow(ws, header, (row) => {
    if (!row.filled("date") && !row.filled("classCode") && !row.filled("choice")) return;
    const r = row.rowNumber;
    const date = asIsoDate(row.value("date"));
    if (!date) warn.add(sheet, r, row.filled("date") ? `Ngày “${row.text("date")}” không hợp lệ.` : "Thiếu ngày.");

    let code = clip(row.text("code"), 40);
    if (!code && date && isFormulaCell(row.cell("code"))) {
      // Legacy formula: "NN-" & TEXT(Ngày,"yyyymmdd") & "-" & TEXT(ROW()-4,"0000") – result not cached in the file.
      code = `NN-${compactDate(date)}-${String(r - header.headerRow).padStart(4, "0")}`;
      warn.add(sheet, r, `Mã sự việc chưa được tính trong file – đã tạo lại theo công thức gốc (${code}).`);
    }
    if (code) {
      const first = codes.get(code);
      if (first !== undefined) warn.add(sheet, r, `Mã sự việc ${code} trùng với dòng ${first}.`);
      else codes.set(code, r);
    }

    const classCode = clip(ctx.resolveClass(row.text("classCode")), 20);
    if (!classCode) warn.add(sheet, r, "Thiếu lớp.");

    const choice = row.text("choice");
    const issueText = row.text("issue");
    const errorCode = clip(resolveErrorCode(choice, issueText, row.text("errorCode"), ctx.catalog), 20);
    if (!errorCode) warn.add(sheet, r, choice ? `Không xác định được mã lỗi từ “${clip(choice, 80)}”.` : "Thiếu lỗi vi phạm.");

    const item: ImportedIncident = { rowNumber: r, code, date, classCode, errorCode };
    const errorText = clip(choice || issueText, 800);
    if (errorText) item.errorText = errorText;

    if (row.filled("occurrence")) {
      const n = asNumber(row.value("occurrence"));
      if (n !== undefined && n >= 0 && n <= 1000) item.occurrenceCount = Math.round(n);
      else warn.add(sheet, r, `Số lần vi phạm “${row.text("occurrence")}” không hợp lệ – bỏ qua.`);
    }
    if (row.filled("unnamed")) {
      const n = asNumber(row.value("unnamed"));
      if (n !== undefined && n >= 0 && n <= 80) item.unnamedCount = Math.round(n);
      else warn.add(sheet, r, `Số HS không rõ tên “${row.text("unnamed")}” không hợp lệ – bỏ qua.`);
    }
    const points = asNumber(row.value("points"));
    if (points !== undefined) item.pointsInFile = points;

    const scope = row.text("scope");
    if (scope) item.scope = clip(canonicalValue(scope, SCOPES), 40);
    const status = row.text("status");
    if (status) item.status = clip(canonicalValue(status, INCIDENT_STATUSES), 60);

    const reporter = textField(row, "reporter", 120, "Người ghi", warn, sheet);
    const detail = textField(row, "detail", 2000, "Nội dung chi tiết", warn, sheet);
    const evidence = clip(evidenceOf(row), 1000);
    if (reporter) item.reporter = reporter;
    if (detail) item.detail = detail;
    if (evidence) item.evidence = evidence;

    const check = row.text("check");
    if (check && !STANDARD_CHECKS.has(foldVN(check))) item.legacyCheckText = clip(check, 500);

    out.push(item);
  });
  return out;
}
