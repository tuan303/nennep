/** Pure "Xem thêm" paging rule for DataTable (unit-tested). */

export interface PagingState {
  /** Row count the current limit was set for. */
  rowCount: number;
  /** `resetKey` the current limit was set for. */
  key: string | undefined;
  /** Rows shown (Infinity = no paging). */
  limit: number;
}

/**
 * Limit to use after `rows`/`resetKey` changed.
 *
 * - No `pageSize` → everything (no paging).
 * - `resetKey` changed (filters, search, period…) → back to the first page.
 * - `resetKey` given and unchanged → the same list was only refreshed (live revalidation, a new record): keep the
 *   rows the user already opened with "Xem thêm".
 * - No `resetKey`: keep the limit while the new list still fills what was visible (a refresh adds/removes a row or
 *   two); a list shorter than that (filters narrowed it) goes back to the first page.
 *
 * Never below one page.
 */
export function nextPageLimit(prev: PagingState, next: { rowCount: number; key: string | undefined }, pageSize: number | undefined): number {
  if (pageSize === undefined || !(pageSize > 0)) return Number.POSITIVE_INFINITY;
  if (prev.key !== next.key) return pageSize;
  let limit: number;
  if (next.key !== undefined) limit = prev.limit;
  else {
    const visibleBefore = Math.min(prev.limit, prev.rowCount);
    limit = next.rowCount >= visibleBefore ? prev.limit : pageSize;
  }
  return Math.max(pageSize, limit);
}
