"use client";
/**
 * Stats strip of the audit screen, independent of the table filters (small exact queries, ≤ 100 rows each):
 * sign-ins today, failed sign-ins today, imports (workbook + roster) this week.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { mondayOf } from "@/lib/engine";
import type { AuditAction, AuditLog } from "@/lib/types";
import { STATS_LIMIT, distinctEmails } from "./lib/audit-query";

export interface Counter {
  count: number;
  /** The server has more rows than STATS_LIMIT. */
  more: boolean;
}

export interface AuditStats {
  status: "loading" | "ready" | "error";
  loginsToday?: Counter & { users: number };
  failedToday?: Counter;
  importsWeek?: Counter & { workbook: number; roster: number };
  reload: () => void;
}

async function count(action: AuditAction, from: string, to: string): Promise<{ items: AuditLog[]; more: boolean }> {
  const page = await api.auditLogs({ action, from, to, limit: STATS_LIMIT });
  return { items: page.items, more: !!page.nextCursor };
}

export function useAuditStats(today: string): AuditStats {
  const [state, setState] = useState<Omit<AuditStats, "reload">>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, status: s.loginsToday ? s.status : "loading" }));
    const week = mondayOf(today);
    Promise.all([count("LOGIN", today, today), count("LOGIN_FAILED", today, today), count("IMPORT_EXCEL", week, today), count("IMPORT_STUDENTS", week, today)])
      .then(([logins, failed, workbook, roster]) => {
        if (id !== seq.current) return;
        setState({
          status: "ready",
          loginsToday: { count: logins.items.length, more: logins.more, users: distinctEmails(logins.items) },
          failedToday: { count: failed.items.length, more: failed.more },
          importsWeek: {
            count: workbook.items.length + roster.items.length,
            more: workbook.more || roster.more,
            workbook: workbook.items.length,
            roster: roster.items.length,
          },
        });
      })
      .catch(() => {
        if (id === seq.current) setState((s) => ({ ...s, status: "error" }));
      });
  }, [today, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
