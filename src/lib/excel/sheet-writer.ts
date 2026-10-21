/**
 * Styled table sheets in the legacy NSHM layout: title row 1, subtitle row 2, blank row 3, header row 4,
 * data from row 5 (so exported files re-import). Navy header with white bold text, frozen header,
 * autofilter, column widths, dd/mm/yyyy dates, zebra rows, A4 landscape printing.
 */
import type { Alignment, Borders, Cell, Fill, Font, Workbook, Worksheet } from "exceljs";
import { isIsoDate } from "../engine/dates";
import { isDateValue, isoToExcelDate } from "./cells";
import { sanitizeSheetName } from "./normalize";

export const HEADER_ROW = 4;
export const FIRST_DATA_ROW = 5;

/** ARGB brand colours (globals.css tokens). */
export const XL_COLORS = {
  navy: "FF23328C",
  royal: "FFD21235",
  gold: "FFF5B301",
  goldSoft: "FFFFF4CC",
  ok: "FF16A34A",
  warn: "FFD97706",
  bad: "FFDC2626",
  muted: "FF64748B",
  canvas: "FFF4F6FB",
  border: "FFE4E9F2",
  white: "FFFFFFFF",
  text: "FF0F172A",
} as const;

export type CellInput = string | number | boolean | Date | null | undefined;

/**
 * text: plain · wrap: multi-line text · number (General format) · integer · center · date: ISO "yyyy-mm-dd" or Date → dd/mm/yyyy ·
 * month: "yyyy-mm" or Date → mm/yyyy · id: always text (keeps leading zeros).
 */
export type ColumnKind = "text" | "wrap" | "number" | "integer" | "center" | "date" | "month" | "id";

export interface CellLook {
  font?: Partial<Font>;
  fill?: Fill;
}

export interface TableColumn<T> {
  header: string;
  width: number;
  kind?: ColumnKind;
  value: (item: T) => CellInput;
  /** optional per-cell emphasis (font colour, fill) */
  look?: (item: T) => CellLook | undefined;
}

export interface TableSheetOptions<T> {
  name: string;
  title: string;
  subtitle?: string;
  columns: ReadonlyArray<TableColumn<T>>;
  items: readonly T[];
  freezeColumns?: number;
  tabColor?: string;
}

const thin = { style: "thin" as const, color: { argb: XL_COLORS.border } };
const BORDER: Partial<Borders> = { top: thin, bottom: thin, left: thin, right: thin };
const HEADER_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_COLORS.navy } };
const ZEBRA_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_COLORS.canvas } };
const HEADER_FONT: Partial<Font> = { name: "Calibri", size: 11, bold: true, color: { argb: XL_COLORS.white } };
const BODY_FONT: Partial<Font> = { name: "Calibri", size: 11, color: { argb: XL_COLORS.text } };

export function solidFill(argb: string): Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function monthToDate(v: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)) : undefined;
}

/** Convert a raw value for the column kind (ISO strings → Date for date/month columns, "" → empty). */
function toCellValue(raw: CellInput, kind: ColumnKind): string | number | boolean | Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (kind === "id") return String(raw);
  if (typeof raw === "string") {
    if (kind === "date" && isIsoDate(raw)) return isoToExcelDate(raw) ?? raw;
    if (kind === "month") return monthToDate(raw.slice(0, 7)) ?? raw;
  }
  return raw;
}

function alignmentFor(kind: ColumnKind): Partial<Alignment> {
  switch (kind) {
    case "wrap":
      return { vertical: "top", wrapText: true };
    case "number":
    case "integer":
      return { vertical: "top", horizontal: "right" };
    case "center":
    case "date":
    case "month":
      return { vertical: "top", horizontal: "center" };
    default:
      return { vertical: "top" };
  }
}

function styleBodyCell(cell: Cell, kind: ColumnKind, zebra: boolean): void {
  cell.font = BODY_FONT;
  cell.border = BORDER;
  cell.alignment = alignmentFor(kind);
  if (zebra) cell.fill = ZEBRA_FILL;
  if (isDateValue(cell.value)) cell.numFmt = kind === "month" ? "mm/yyyy" : "dd/mm/yyyy";
  else if (kind === "integer") cell.numFmt = "#,##0";
  else if (kind === "id") cell.numFmt = "@";
}

/** Title (row 1), subtitle (row 2) and header (row 4) of a sheet with `columnCount` columns. */
export function writeSheetHeading(ws: Worksheet, title: string, subtitle: string | undefined, headers: readonly string[]): void {
  const n = Math.max(1, headers.length);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { name: "Calibri", size: 15, bold: true, color: { argb: XL_COLORS.navy } };
  ws.getCell(1, 1).alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;
  if (subtitle) {
    ws.getCell(2, 1).value = subtitle;
    ws.getCell(2, 1).font = { name: "Calibri", size: 10, italic: true, color: { argb: XL_COLORS.muted } };
  }
  if (n > 1) {
    ws.mergeCells(1, 1, 1, n);
    if (subtitle) ws.mergeCells(2, 1, 2, n);
  }
  const header = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const cell = header.getCell(i + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  header.height = 32;
}

/** Add a styled table sheet and return it. */
export function addTableSheet<T>(wb: Workbook, opts: TableSheetOptions<T>): Worksheet {
  const { columns, items } = opts;
  const ws = wb.addWorksheet(sanitizeSheetName(opts.name), {
    views: [{ state: "frozen", xSplit: opts.freezeColumns ?? 0, ySplit: HEADER_ROW, activeCell: "A5", showGridLines: false }],
    properties: opts.tabColor ? { tabColor: { argb: opts.tabColor } } : {},
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}` },
  });
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  writeSheetHeading(ws, opts.title, opts.subtitle, columns.map((c) => c.header));

  items.forEach((item, idx) => {
    const row = ws.getRow(FIRST_DATA_ROW + idx);
    const zebra = idx % 2 === 1;
    columns.forEach((c, ci) => {
      const kind = c.kind ?? "text";
      const cell = row.getCell(ci + 1);
      cell.value = toCellValue(c.value(item), kind);
      styleBodyCell(cell, kind, zebra);
      const look = c.look?.(item);
      if (look?.font) cell.font = { ...BODY_FONT, ...look.font };
      if (look?.fill) cell.fill = look.fill;
    });
  });

  if (columns.length > 0) {
    ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: columns.length } };
  }
  return ws;
}
