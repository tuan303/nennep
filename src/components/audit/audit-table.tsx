"use client";
/** Audit log table (cards below 640px). Rows open the detail sheet. */
import { useMemo, type ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import type { AuditLog } from "@/lib/types";
import { AuditActionBadge, RoleBadge } from "./audit-badges";
import { auditActionLabel, entityLabel } from "./lib/audit-labels";
import { summarizeAudit } from "./lib/audit-summary";

interface Row {
  log: AuditLog;
  summary: string;
}

function Entity({ log }: { log: AuditLog }) {
  if (!log.entity && !log.entityId) return <span className="text-slate-400">–</span>;
  return (
    <div className="flex min-w-0 max-w-56 flex-col">
      <span className="truncate text-[13px] text-slate-700">{entityLabel(log.entity) || "–"}</span>
      {log.entityId ? (
        <span className="truncate font-mono text-[11.5px] text-slate-500" title={log.entityId}>
          {log.entityId}
        </span>
      ) : null}
    </div>
  );
}

export function AuditTable({
  items,
  onOpen,
  emptyState,
  loading,
}: {
  items: readonly AuditLog[];
  onOpen: (log: AuditLog) => void;
  emptyState: ReactNode;
  loading?: boolean;
}) {
  const rows = useMemo<Row[]>(() => items.map((log) => ({ log, summary: summarizeAudit(log) })), [items]);
  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "ts",
        header: "Thời gian",
        cell: ({ log }) => (
          <div className="flex flex-col whitespace-nowrap">
            <span className="num text-[13px] text-slate-800">{fmtDateTime(log.ts)}</span>
            <span className="text-xs text-slate-500">{fmtRelative(log.ts)}</span>
          </div>
        ),
        sortValue: ({ log }) => log.ts,
      },
      {
        key: "user",
        header: "Người dùng",
        cell: ({ log }) => (
          <div className="flex min-w-0 max-w-60 flex-col items-start gap-1">
            <span className="max-w-full truncate text-[13px] font-medium text-slate-900" title={log.email}>
              {log.email || "Không rõ"}
            </span>
            <RoleBadge role={log.role} />
          </div>
        ),
        sortValue: ({ log }) => log.email,
      },
      { key: "action", header: "Hành động", cell: ({ log }) => <AuditActionBadge action={log.action} />, sortValue: ({ log }) => auditActionLabel(log.action) },
      { key: "entity", header: "Đối tượng", cell: ({ log }) => <Entity log={log} /> },
      { key: "level", header: "Cấp", cell: ({ log }) => (log.levelId ? <span className="text-[13px]">{LEVELS[log.levelId].short}</span> : <span className="text-slate-400">–</span>) },
      {
        key: "summary",
        header: "Tóm tắt",
        cell: ({ summary }) => (summary ? <span className="line-clamp-2 max-w-[22rem] text-[13px] text-slate-700">{summary}</span> : <span className="text-slate-400">–</span>),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.log.id}
      onRowClick={(r) => onOpen(r.log)}
      rowLabel={(r) => `Xem chi tiết: ${auditActionLabel(r.log.action)} lúc ${fmtDateTime(r.log.ts)}`}
      caption="Nhật ký hệ thống"
      dense
      loading={loading}
      loadingRows={8}
      emptyState={emptyState}
      rowClassName={(r) => (r.log.action === "LOGIN_FAILED" ? "bg-warn-soft/40" : undefined)}
      mobileCard={({ log, summary }) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <AuditActionBadge action={log.action} />
            <span className="num shrink-0 text-xs text-slate-500">{fmtDateTime(log.ts)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[13px] font-medium text-slate-900">{log.email || "Không rõ"}</span>
            <RoleBadge role={log.role} />
            {log.levelId ? <span className="shrink-0 text-xs text-slate-500">· {LEVELS[log.levelId].short}</span> : null}
          </div>
          {summary ? <p className="line-clamp-2 text-[13px] text-slate-600">{summary}</p> : null}
          {log.entityId ? (
            <p className="truncate font-mono text-[11.5px] text-slate-400">
              {entityLabel(log.entity)} · {log.entityId}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
