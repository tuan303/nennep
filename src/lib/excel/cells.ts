/**
 * Cell value extraction for ExcelJS values: formulas (cached result), shared formulas, rich text,
 * hyperlinks, error values, Dates, numbers stored as text.
 */
import type { Cell, CellValue } from "exceljs";
import { dateToIso, parseLooseDate } from "../engine/dates";

/** Plain value of a cell after unwrapping formulas / rich text / hyperlinks. Errors and missing results → null. */
export type Scalar = string | number | boolean | Date | null;

export function isDateValue(v: unknown): v is Date {
  return v instanceof Date || Object.prototype.toString.call(v) === "[object Date]";
}

function richTextToString(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text ?? "") : "")).join("");
}

/** Unwrap any ExcelJS cell value into a Scalar (uses the cached result of formulas). */
export function cellScalar(value: CellValue | unknown): Scalar {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isDateValue(value)) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if ("formula" in o || "sharedFormula" in o) return cellScalar(o.result);
  if ("richText" in o) return richTextToString(o.richText);
  if ("hyperlink" in o || "text" in o) {
    const t = o.text;
    if (t && typeof t === "object" && "richText" in t) return richTextToString((t as { richText: unknown }).richText);
    return cellScalar(t);
  }
  return null; // { error: "#N/A" } and unknown shapes
}

/** True when the cell holds a formula (with or without a cached result). */
export function isFormulaCell(cell: Cell | undefined): boolean {
  const v: unknown = cell?.value;
  return !!v && typeof v === "object" && ("formula" in v || "sharedFormula" in v);
}

/** Hyperlink target of a cell when it is an http(s) link, else undefined. */
export function cellHyperlink(cell: Cell | undefined): string | undefined {
  const v: unknown = cell?.value;
  if (v && typeof v === "object" && "hyperlink" in v) {
    const link = String((v as { hyperlink: unknown }).hyperlink ?? "").trim();
    if (/^https?:\/\//i.test(link)) return link;
  }
  return undefined;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e9) / 1e9);
}

/** Trimmed text of a scalar ("" when empty). Dates → yyyy-mm-dd, integers without decimals. */
export function asText(v: Scalar): string {
  if (v === null) return "";
  if (typeof v === "string") return v.replace(/ /g, " ").trim();
  if (typeof v === "number") return trimNumber(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return dateToIso(v);
}

/** Numeric value; accepts numbers stored as text ("2", "2,5", " 10 "). */
export function asNumber(v: Scalar): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\s ]/g, "");
  if (!/^[-+]?\d+(?:[.,]\d+)?$/.test(t)) return undefined;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Excel serial day number → yyyy-mm-dd ("" when out of a sane range). */
export function serialToIso(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1 || serial > 100_000) return "";
  return new Date(EXCEL_EPOCH_MS + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

/** Calendar date "yyyy-mm-dd" from a Date, an Excel serial, "dd/mm/yyyy" or "yyyy-mm-dd" text; "" if invalid. */
export function asIsoDate(v: Scalar): string {
  if (v === null || typeof v === "boolean") return "";
  if (isDateValue(v)) return dateToIso(v);
  if (typeof v === "number") return serialToIso(v);
  const t = v.trim();
  if (!t) return "";
  return parseLooseDate(t) || parseLooseDate(t.split(/[\sT]+/)[0] ?? "");
}

/** Month "yyyy-mm" from a date-like value, "yyyy-mm", "9/2026" or "Tháng 9/2026"; "" if invalid. */
export function asMonth(v: Scalar): string {
  const iso = asIsoDate(v);
  if (iso) return iso.slice(0, 7);
  if (typeof v !== "string") return "";
  const t = v.trim();
  let m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2].padStart(2, "0")}` : "";
  m = /(\d{1,2})\s*[/.-]\s*(\d{4})\s*$/.exec(t);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
  return "";
}

/** "yyyy-mm-dd" → JS Date at UTC midnight (what Excel/ExcelJS expect for date-only cells). */
export function isoToExcelDate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
