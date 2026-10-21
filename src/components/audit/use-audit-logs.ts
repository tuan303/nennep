"use client";
/**
 * Cursor pagination over GET /api/audit-logs. A page may hold fewer than `limit` rows while more exist (the server
 * scans at most 3 000 logs per call), so "Tải thêm" stays available as long as `nextCursor` is returned.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { AuditLog } from "@/lib/types";
import { AUDIT_PAGE_SIZE, filterKey, type AppliedAuditFilter } from "./lib/audit-query";

export interface AuditLogsState {
  items: AuditLog[];
  nextCursor?: string;
  status: "loading" | "ready" | "error";
  error?: string;
  loadingMore: boolean;
  /** Error of the last "Tải thêm" (the rows already loaded stay). */
  moreError?: string;
  /** Number of requests made for the current filter. */
  pages: number;
  reload: () => void;
  /** Resolves false when the request failed (message in `moreError`). */
  loadMore: () => Promise<boolean>;
}

interface State {
  key: string;
  items: AuditLog[];
  nextCursor?: string;
  status: "loading" | "ready" | "error";
  error?: string;
  loadingMore: boolean;
  moreError?: string;
  pages: number;
}

export function useAuditLogs(filter: AppliedAuditFilter): AuditLogsState {
  const key = filterKey(filter);
  const [state, setState] = useState<State>({ key, items: [], status: "loading", loadingMore: false, pages: 0 });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setState({ key, items: [], status: "loading", loadingMore: false, pages: 0 });
    api
      .auditLogs({ ...filter.query, limit: AUDIT_PAGE_SIZE })
      .then((page) => {
        if (id === seq.current) setState({ key, items: page.items, nextCursor: page.nextCursor, status: "ready", loadingMore: false, pages: 1 });
      })
      .catch((err: unknown) => {
        if (id === seq.current) setState({ key, items: [], status: "error", error: errorMessage(err), loadingMore: false, pages: 0 });
      });
    // A new filter object (also "Lọc" with the same values) or reload() → first page again.
  }, [filter, key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const loadMore = useCallback(async () => {
    const cursor = state.nextCursor;
    if (!cursor || state.loadingMore || state.key !== key) return true;
    const id = seq.current;
    setState((s) => ({ ...s, loadingMore: true, moreError: undefined }));
    try {
      const page = await api.auditLogs({ ...filter.query, cursor, limit: AUDIT_PAGE_SIZE });
      if (id !== seq.current) return true;
      setState((s) => {
        const seen = new Set(s.items.map((l) => l.id));
        return { ...s, items: [...s.items, ...page.items.filter((l) => !seen.has(l.id))], nextCursor: page.nextCursor, loadingMore: false, pages: s.pages + 1 };
      });
      return true;
    } catch (err) {
      if (id === seq.current) setState((s) => ({ ...s, loadingMore: false, moreError: errorMessage(err) }));
      return false;
    }
  }, [state.nextCursor, state.loadingMore, state.key, key, filter.query]);

  const current: State = state.key === key ? state : { key, items: [], status: "loading", loadingMore: false, pages: 0 };
  return { ...current, reload, loadMore };
}
