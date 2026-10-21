/**
 * Generic, header-driven sheet reading: find a sheet by (accent-insensitive) name, locate its header row
 * by alias matching, then iterate data rows through typed accessors. Columns are NEVER mapped by position.
 */
import type { Cell, Workbook, Worksheet } from "exceljs";
import { asText, cellScalar, type Scalar } from "./cells";
import { headerKey } from "./normalize";

/* -------------------------------- warnings -------------------------------- */

/** Collects Vietnamese, user-facing warnings ("Nhập liệu – dòng 12: …"), capped to keep previews readable. */
export class Warnings {
  private readonly items: string[] = [];
  private dropped = 0;

  constructor(private readonly limit = 300) {}

  add(sheet: string | undefined, row: number | undefined, message: string): void {
    if (this.items.length >= this.limit) {
      this.dropped++;
      return;
    }
    const where = sheet ? (row ? `${sheet} – dòng ${row}: ` : `${sheet}: `) : "";
    this.items.push(where + message);
  }

  list(): string[] {
    return this.dropped > 0 ? [...this.items, `… và ${this.dropped} cảnh báo khác.`] : [...this.items];
  }
}

/* --------------------------------- sheets --------------------------------- */

/** First worksheet whose name equals one of `names` (accent/case-insensitive), else whose name contains one. */
export function findSheet(wb: Workbook, names: readonly string[]): Worksheet | undefined {
  const keys = names.map(headerKey);
  const sheets = wb.worksheets;
  return (
    sheets.find((ws) => keys.includes(headerKey(ws.name))) ??
    sheets.find((ws) => {
      const k = headerKey(ws.name);
      return keys.some((alias) => k.includes(alias));
    })
  );
}

/* --------------------------------- headers -------------------------------- */

/**
 * A logical column. Aliases are written in natural Vietnamese and compared with `headerKey`
 * (exact match). An alias ending with "*" also matches headers that START with it (whole words).
 */
export interface FieldSpec<K extends string> {
  key: K;
  aliases: readonly string[];
  required?: boolean;
}

export type ColumnMap<K extends string> = Partial<Record<K, number>>;

export interface HeaderMatch<K extends string> {
  headerRow: number;
  cols: ColumnMap<K>;
}

function headerKeysOfRow(ws: Worksheet, rowNumber: number): Map<number, string> {
  const keys = new Map<number, string>();
  ws.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
    if (cell.isMerged && cell.master.address !== cell.address) return;
    const k = headerKey(asText(cellScalar(cell.value)));
    if (k) keys.set(col, k);
  });
  return keys;
}

/** Map fields to columns of one header row: exact alias matches first, then "prefix*" aliases. */
export function matchColumns<K extends string>(keys: Map<number, string>, fields: readonly FieldSpec<K>[]): ColumnMap<K> {
  const cols: ColumnMap<K> = {};
  const claimed = new Set<number>();
  const entries = [...keys.entries()].sort((a, b) => a[0] - b[0]);
  const claim = (field: FieldSpec<K>, test: (k: string) => boolean): boolean => {
    const hit = entries.find(([col, k]) => !claimed.has(col) && test(k));
    if (!hit) return false;
    claimed.add(hit[0]);
    cols[field.key] = hit[0];
    return true;
  };
  for (const f of fields) {
    for (const alias of f.aliases) {
      const a = headerKey(alias);
      if (a && claim(f, (k) => k === a)) break;
    }
  }
  for (const f of fields) {
    if (cols[f.key] !== undefined) continue;
    for (const alias of f.aliases) {
      if (!alias.endsWith("*")) continue;
      const a = headerKey(alias.slice(0, -1));
      if (a && claim(f, (k) => k.startsWith(a + " "))) break;
    }
  }
  return cols;
}

/**
 * Locate the header row among rows 1..maxRow: the row with all required fields and the most matches
 * (earliest wins on ties). Legacy NSHM sheets use row 4, but this is detected, not assumed.
 */
export function findHeader<K extends string>(ws: Worksheet, fields: readonly FieldSpec<K>[], maxRow = 10): HeaderMatch<K> | undefined {
  let best: (HeaderMatch<K> & { score: number }) | undefined;
  const last = Math.min(maxRow, ws.rowCount);
  for (let r = 1; r <= last; r++) {
    const keys = headerKeysOfRow(ws, r);
    if (keys.size === 0) continue;
    const cols = matchColumns(keys, fields);
    if (!fields.every((f) => !f.required || cols[f.key] !== undefined)) continue;
    const score = Object.keys(cols).length;
    if (!best || score > best.score) best = { headerRow: r, cols, score };
  }
  return best ? { headerRow: best.headerRow, cols: best.cols } : undefined;
}

/* ---------------------------------- rows ---------------------------------- */

export interface RowReader<K extends string> {
  rowNumber: number;
  has(key: K): boolean; // column present in the header
  cell(key: K): Cell | undefined;
  value(key: K): Scalar;
  text(key: K): string;
  /** true when the cell holds anything meaningful (non-blank text, number, date, boolean) */
  filled(key: K): boolean;
}

/**
 * Iterate the non-empty rows below the header (only rows stored in the file are visited, so sheets with
 * stray formatting far below the data stay cheap). Callers decide what counts as a data row.
 */
export function forEachDataRow<K extends string>(ws: Worksheet, match: HeaderMatch<K>, fn: (row: RowReader<K>) => void): void {
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r <= match.headerRow) return;
    const cell = (key: K): Cell | undefined => {
      const col = match.cols[key];
      return col === undefined ? undefined : row.getCell(col);
    };
    const value = (key: K): Scalar => cellScalar(cell(key)?.value);
    const reader: RowReader<K> = {
      rowNumber: r,
      has: (key) => match.cols[key] !== undefined,
      cell,
      value,
      text: (key) => asText(value(key)),
      filled: (key) => {
        const v = value(key);
        return v !== null && (typeof v !== "string" || v.trim() !== "");
      },
    };
    fn(reader);
  });
}
