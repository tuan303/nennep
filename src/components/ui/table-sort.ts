/** Pure sorting helpers for DataTable (unit-tested). */

export type SortDir = "asc" | "desc";
export type SortValue = string | number | null | undefined;
export interface SortState {
  key: string;
  dir: SortDir;
}

const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

/** Compare two sort values; empty values (null/undefined/NaN/"") always go last regardless of direction. */
export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const ea = a === null || a === undefined || a === "" || (typeof a === "number" && Number.isNaN(a));
  const eb = b === null || b === undefined || b === "" || (typeof b === "number" && Number.isNaN(b));
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  let c: number;
  if (typeof a === "number" && typeof b === "number") c = a - b;
  else c = collator.compare(String(a), String(b));
  return dir === "asc" ? c : -c;
}

/** Stable sort of `rows` by `getValue`. */
export function sortRows<T>(rows: readonly T[], getValue: (row: T) => SortValue, dir: SortDir): T[] {
  return rows
    .map((row, i) => ({ row, i, v: getValue(row) }))
    .sort((x, y) => compareSortValues(x.v, y.v, dir) || x.i - y.i)
    .map((x) => x.row);
}

/** Numbers sort high→low on first click (scores, points), text A→Z. */
export function firstSortDir<T>(rows: readonly T[], getValue: (row: T) => SortValue): SortDir {
  for (const r of rows) {
    const v = getValue(r);
    if (v === null || v === undefined || v === "") continue;
    return typeof v === "number" ? "desc" : "asc";
  }
  return "asc";
}

/** Next state when a header is clicked: new column → its first direction; same column → flip. */
export function nextSort(current: SortState | null, key: string, first: SortDir): SortState {
  if (!current || current.key !== key) return { key, dir: first };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}
