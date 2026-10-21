"use client";

import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";
import { useIsMobile } from "./hooks";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./states";
import { nextPageLimit } from "./table-paging";
import { firstSortDir, nextSort, sortRows, type SortState, type SortValue } from "./table-sort";

export interface DataTableColumn<T> {
  /** Unique column id (also used by initialSort). */
  key: string;
  header: ReactNode;
  /** Plain-text header for screen readers / the mobile sort menu when `header` is not a string. */
  headerLabel?: string;
  cell: (row: T, index: number) => ReactNode;
  /** Enables sorting by this column. Numbers sort high→low on first click, text A→Z. */
  sortValue?: (row: T) => SortValue;
  align?: "left" | "center" | "right";
  /** CSS width of the column, e.g. 72 or "30%". */
  width?: number | string;
  /** Classes for body cells. */
  className?: string;
  headerClassName?: string;
  /** Hide this column below 640px (when no `mobileCard` is given). */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Accessible name of a clickable row, e.g. (r) => `Xem lớp ${r.classCode}`. */
  rowLabel?: (row: T) => string;
  initialSort?: SortState;
  /** Shown when `rows` is empty (default: "Không có dữ liệu phù hợp"). */
  emptyState?: ReactNode;
  /** Card renderer used below 640px instead of the table. */
  mobileCard?: (row: T, index: number) => ReactNode;
  /** Show this many rows, then a "Xem thêm" button. */
  pageSize?: number;
  /**
   * Identity of the list's inputs (filters, search text, period…). "Xem thêm" goes back to the first page only when
   * it changes; a new `rows` array with the same key (live data refresh) keeps the rows already opened. Without it,
   * the table keeps the opened rows while the new list is at least as long as what was visible.
   */
  resetKey?: string;
  /** Header stays visible while the table scrolls inside a box of `maxHeight` (default 70vh). */
  stickyHeader?: boolean;
  maxHeight?: number | string;
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
  /** Screen-reader caption describing the table. */
  caption?: string;
  loading?: boolean;
  loadingRows?: number;
  className?: string;
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;
const JUSTIFY = { left: "justify-start", center: "justify-center", right: "justify-end" } as const;

function headerText(c: { header: ReactNode; headerLabel?: string; key: string }): string {
  return c.headerLabel ?? (typeof c.header === "string" ? c.header : c.key);
}

/**
 * Sortable data table. Wrap it in `<Card padding="none">`. On phones it renders `mobileCard`
 * rows (if given) with a sort menu; otherwise columns marked `hideOnMobile` are hidden.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  initialSort,
  emptyState,
  mobileCard,
  pageSize,
  resetKey,
  stickyHeader,
  maxHeight = "70vh",
  dense,
  rowClassName,
  caption,
  loading,
  loadingRows = 5,
  className,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const sortSelectId = useId();
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [paging, setPaging] = useState({ rows, key: resetKey, limit: pageSize ?? Number.POSITIVE_INFINITY });
  let limit = paging.limit;
  if (paging.rows !== rows || paging.key !== resetKey) {
    // New inputs → first page; the same list refreshed (new array identity) → keep what the user opened.
    limit = nextPageLimit({ rowCount: paging.rows.length, key: paging.key, limit: paging.limit }, { rowCount: rows.length, key: resetKey }, pageSize);
    setPaging({ rows, key: resetKey, limit });
  }

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    return col?.sortValue ? sortRows(rows, col.sortValue, sort.dir) : rows;
  }, [rows, sort, columns]);

  const visible = sorted.slice(0, limit);
  const remaining = sorted.length - visible.length;
  const useCards = isMobile && !!mobileCard;

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return;
    setSort((s) => nextSort(s, col.key, firstSortDir(rows, col.sortValue!)));
  }

  function rowKeyDown(e: KeyboardEvent<HTMLElement>, row: T) {
    if (!onRowClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(row);
    }
  }

  if (!loading && rows.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? <EmptyState size="sm" title="Không có dữ liệu phù hợp" description="Thử đổi bộ lọc hoặc khoảng thời gian." />}
      </div>
    );
  }

  const more =
    remaining > 0 ? (
      <div className="flex flex-col items-center gap-1.5 border-t border-border px-4 py-3" data-print-hide>
        <Button variant="ghost" size="sm" iconRight={ChevronDown} onClick={() => setPaging({ rows, key: resetKey, limit: limit + (pageSize ?? remaining) })}>
          Xem thêm {Math.min(pageSize ?? remaining, remaining)} dòng
        </Button>
        <span className="num text-xs text-slate-500">
          Đang hiển thị {visible.length}/{sorted.length}
        </span>
      </div>
    ) : null;

  if (useCards) {
    const sortable = columns.filter((c) => c.sortValue);
    return (
      <div className={cn("min-w-0", className)}>
        {sortable.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <label className="text-[13px] text-slate-500" htmlFor={sortSelectId}>
              Sắp xếp
            </label>
            <div className="relative">
              <select
                id={sortSelectId}
                className="h-10 appearance-none rounded-lg bg-surface-3 pl-3 pr-8 text-base font-semibold text-slate-800 outline-none focus-visible:outline-2 focus-visible:outline-brand-500"
                value={sort ? `${sort.key}:${sort.dir}` : ""}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  setSort(key ? { key, dir: dir === "asc" ? "asc" : "desc" } : null);
                }}
              >
                <option value="">Mặc định</option>
                {sortable.map((c) => (
                  <optgroup key={c.key} label={headerText(c)}>
                    <option value={`${c.key}:desc`}>{headerText(c)} – giảm dần</option>
                    <option value={`${c.key}:asc`}>{headerText(c)} – tăng dần</option>
                  </optgroup>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
        ) : null}
        <ul role="list" aria-label={caption} className="divide-y divide-border">
          {loading
            ? Array.from({ length: loadingRows }, (_, i) => (
                <li key={i} className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3.5 w-1/2" />
                </li>
              ))
            : visible.map((row, i) =>
                onRowClick ? (
                  <li key={rowKey(row)} className={rowClassName?.(row)}>
                    <button
                      type="button"
                      aria-label={rowLabel?.(row)}
                      onClick={() => onRowClick(row)}
                      className="block w-full px-4 py-3.5 text-left transition-colors active:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                    >
                      {mobileCard!(row, i)}
                    </button>
                  </li>
                ) : (
                  <li key={rowKey(row)} className={cn("px-4 py-3.5", rowClassName?.(row))}>
                    {mobileCard!(row, i)}
                  </li>
                ),
              )}
        </ul>
        {more}
      </div>
    );
  }

  const wrapStyle: CSSProperties | undefined = stickyHeader ? { maxHeight } : undefined;
  const cellPad = dense ? "py-2" : "py-3";

  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("relative w-full", stickyHeader ? "overflow-auto" : "overflow-x-auto")} style={wrapStyle}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c, ci) => {
                const active = sort?.key === c.key;
                const align = c.align ?? "left";
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : c.sortValue ? "none" : undefined}
                    style={c.width != null ? { width: c.width } : undefined}
                    className={cn(
                      "h-10 whitespace-nowrap border-b border-border bg-surface-2 px-3 text-[12.5px] font-semibold text-slate-500",
                      ALIGN[align],
                      ci === 0 && "pl-4 sm:pl-5",
                      ci === columns.length - 1 && "pr-4 sm:pr-5",
                      stickyHeader && "sticky top-0 z-10",
                      c.hideOnMobile && "max-sm:hidden",
                      c.headerClassName,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        className={cn(
                          "group -mx-1.5 inline-flex h-8 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-slate-900/5 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-brand-500",
                          JUSTIFY[align],
                          active && "text-brand-800",
                        )}
                      >
                        <span>{c.header}</span>
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp aria-hidden className="size-3.5" strokeWidth={2.5} />
                          ) : (
                            <ArrowDown aria-hidden className="size-3.5" strokeWidth={2.5} />
                          )
                        ) : (
                          <ChevronsUpDown aria-hidden className="size-3.5 opacity-40 group-hover:opacity-80" strokeWidth={2.25} />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: loadingRows }, (_, ri) => (
                  <tr key={`sk${ri}`}>
                    {columns.map((c, ci) => (
                      <td key={c.key} className={cn("border-b border-border px-3", cellPad, ci === 0 && "pl-4 sm:pl-5", c.hideOnMobile && "max-sm:hidden")}>
                        <Skeleton className={cn("h-4", ci === 0 ? "w-16" : "w-full max-w-24", c.align === "right" && "ml-auto")} />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.map((row, ri) => (
                  <tr
                    key={rowKey(row)}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={onRowClick ? rowLabel?.(row) : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => rowKeyDown(e, row) : undefined}
                    className={cn(
                      "group/row transition-colors duration-100 [&:last-child>td]:border-b-0",
                      onRowClick && "cursor-pointer hover:bg-brand-50/50 focus-visible:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500",
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={cn(
                          "border-b border-border px-3 align-middle text-slate-700",
                          cellPad,
                          ALIGN[c.align ?? "left"],
                          c.align === "right" && "num",
                          ci === 0 && "pl-4 sm:pl-5",
                          ci === columns.length - 1 && "pr-4 sm:pr-5",
                          c.hideOnMobile && "max-sm:hidden",
                          c.className,
                        )}
                      >
                        {c.cell(row, ri)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {more}
    </div>
  );
}
