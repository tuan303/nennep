"use client";
/** Table view of the Action Register (cards below 640px). */
import { useMemo } from "react";
import { SearchX } from "lucide-react";
import { DataTable, EmptyState, PriorityBadge, StatusBadge, type DataTableColumn } from "@/components/ui";
import { formatDateVN } from "@/lib/engine";
import type { ActionItem } from "@/lib/types";
import { DeadlineBadge, OwnerChip, ScopeClassPill } from "./action-bits";
import { PRIORITY_RANK, deadlineState } from "./lib/action-view";

const STATUS_RANK = { Open: 0, Doing: 1, Done: 2 } as const;

export function ActionTable({ items, today, onOpen }: { items: readonly ActionItem[]; today: string; onOpen: (item: ActionItem) => void }) {
  const columns = useMemo<DataTableColumn<ActionItem>[]>(
    () => [
      {
        key: "title",
        header: "Hành động",
        cell: (r) => (
          <div className="flex min-w-0 max-w-[28rem] flex-col gap-0.5">
            <span className="line-clamp-2 font-medium text-slate-900">{r.title}</span>
            <span className="num text-xs text-slate-500">{r.code}</span>
          </div>
        ),
        sortValue: (r) => r.title,
      },
      { key: "priority", header: "Ưu tiên", cell: (r) => <PriorityBadge priority={r.priority} size="sm" />, sortValue: (r) => 2 - PRIORITY_RANK[r.priority] },
      { key: "owner", header: "Người phụ trách", cell: (r) => <OwnerChip owner={r.owner} className="max-w-48" />, sortValue: (r) => r.owner },
      {
        key: "deadline",
        header: "Hạn xử lý",
        cell: (r) => (
          <div className="flex flex-col items-start gap-1">
            <span className="num text-[13px] text-slate-700">{formatDateVN(r.deadline)}</span>
            <DeadlineBadge item={r} today={today} withDate={false} />
          </div>
        ),
        sortValue: (r) => -deadlineState(r, today).daysLeft,
      },
      { key: "scope", header: "Lớp", cell: (r) => (r.scopeClass ? <ScopeClassPill code={r.scopeClass} /> : <span className="text-[13px] text-slate-400">Toàn cấp</span>), sortValue: (r) => r.scopeClass ?? "" },
      { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={r.status} size="sm" />, sortValue: (r) => STATUS_RANK[r.status] },
    ],
    [today],
  );

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(r) => r.id}
      onRowClick={onOpen}
      rowLabel={(r) => `Xem hành động ${r.code}`}
      caption="Sổ hành động"
      pageSize={30}
      emptyState={<EmptyState size="sm" icon={SearchX} title="Không có hành động phù hợp" description="Thử đổi từ khóa tìm kiếm hoặc mức ưu tiên." />}
      mobileCard={(r) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="line-clamp-2 text-sm font-semibold text-brand-900">{r.title}</span>
            <StatusBadge status={r.status} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={r.priority} size="sm" />
            <DeadlineBadge item={r} today={today} />
            <ScopeClassPill code={r.scopeClass} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <OwnerChip owner={r.owner} />
            <span className="num shrink-0 text-xs text-slate-400">{r.code}</span>
          </div>
        </div>
      )}
    />
  );
}
