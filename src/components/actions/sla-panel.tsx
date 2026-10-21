"use client";
/** "Quá hạn & leo thang" tab (FR-ACT-003): overdue actions, escalation beyond the SLA of each priority, due soon. */
import { useMemo } from "react";
import { AlarmClock, CalendarClock, CircleCheck, Copy, Pencil, Siren, Eye } from "lucide-react";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, KpiCard, PriorityBadge, SkeletonCard, type DataTableColumn } from "@/components/ui";
import { copyWithFallback } from "@/components/app/widgets";
import { PRIORITY_LABELS } from "@/lib/constants";
import { formatDateVN } from "@/lib/engine";
import type { ActionItem, Priority } from "@/lib/types";
import { DeadlineBadge, OwnerChip, ScopeClassPill } from "./action-bits";
import { PRIORITY_RANK, dueSoonRows, slaRows, type SlaRow } from "./lib/action-view";
import type { ActionListState } from "./use-action-list";

export interface SlaPanelProps {
  list: ActionListState;
  today: string;
  sla: Record<Priority, number>;
  canManage: boolean;
  onOpen: (item: ActionItem) => void;
}

function EscalationBadge({ row }: { row: SlaRow }) {
  return row.escalate ? (
    <Badge tone="bad" variant="solid" size="sm" icon={Siren}>
      Cần leo thang
    </Badge>
  ) : (
    <Badge tone="warn" size="sm" icon={AlarmClock}>
      Quá hạn
    </Badge>
  );
}

function escalationText(rows: SlaRow[], today: string): string {
  const lines = [`DANH SÁCH HÀNH ĐỘNG CẦN LEO THANG – ${formatDateVN(today)}`];
  rows.forEach((r, i) => {
    lines.push(`${i + 1}) ${r.item.title} (${r.item.code})`);
    lines.push(`   Phụ trách: ${r.item.owner} · Ưu tiên ${PRIORITY_LABELS[r.item.priority].toLowerCase()} · Hạn ${formatDateVN(r.item.deadline)} · quá hạn ${r.overdueDays} ngày`);
  });
  return lines.join("\n");
}

export function SlaPanel({ list, today, sla, canManage, onOpen }: SlaPanelProps) {
  const items = list.items;
  const rows = useMemo(() => slaRows(items ?? [], sla, today), [items, sla, today]);
  const soon = useMemo(() => dueSoonRows(items ?? [], today), [items, today]);
  const escalations = rows.filter((r) => r.escalate);
  const loading = list.status === "loading";

  const columns = useMemo<DataTableColumn<SlaRow>[]>(
    () => [
      {
        key: "title",
        header: "Hành động",
        cell: (r) => (
          <div className="flex min-w-0 max-w-[26rem] flex-col gap-0.5">
            <span className="line-clamp-2 font-medium text-slate-900">{r.item.title}</span>
            <span className="num text-xs text-slate-500">
              {r.item.code}
              {r.item.scopeClass ? ` · Lớp ${r.item.scopeClass}` : ""}
            </span>
          </div>
        ),
      },
      { key: "owner", header: "Người nhận", cell: (r) => <OwnerChip owner={r.item.owner} className="max-w-44" />, sortValue: (r) => r.item.owner },
      { key: "priority", header: "Ưu tiên", cell: (r) => <PriorityBadge priority={r.item.priority} size="sm" />, sortValue: (r) => 2 - PRIORITY_RANK[r.item.priority] },
      {
        key: "days",
        header: "Quá hạn",
        align: "right",
        cell: (r) => (
          <span className="flex flex-col items-end">
            <span className="font-bold text-bad-strong">{r.overdueDays} ngày</span>
            <span className="text-xs text-slate-500">hạn {formatDateVN(r.item.deadline)}</span>
          </span>
        ),
        sortValue: (r) => r.overdueDays,
      },
      { key: "level", header: "Mức độ", cell: (r) => <EscalationBadge row={r} />, sortValue: (r) => Number(r.escalate) },
      {
        key: "act",
        header: <span className="sr-only">Thao tác</span>,
        headerLabel: "Thao tác",
        align: "right",
        cell: (r) => (
          <Button
            size="sm"
            variant="secondary"
            icon={canManage ? Pencil : Eye}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(r.item);
            }}
          >
            {canManage ? "Cập nhật" : "Xem"}
          </Button>
        ),
      },
    ],
    [canManage, onOpen],
  );

  if (list.status === "error") {
    return (
      <Card padding="none">
        <ErrorState message={list.error} onRetry={() => void list.reload()} retrying={list.refreshing} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard label="Quá hạn" value={rows.length} icon={AlarmClock} tone={rows.length ? "bad" : "ok"} loading={loading} hint="Chưa hoàn thành và đã qua hạn xử lý." />
        <KpiCard
          label="Cần leo thang"
          value={escalations.length}
          icon={Siren}
          tone={escalations.length ? "bad" : "muted"}
          loading={loading}
          hint={`Quá hạn lâu hơn SLA: Cao ${sla.High} ngày · Trung bình ${sla.Medium} ngày · Thấp ${sla.Low} ngày.`}
        />
        <KpiCard label="Sắp đến hạn (≤ 2 ngày)" value={soon.length} icon={CalendarClock} tone={soon.length ? "warn" : "muted"} loading={loading} className="col-span-2 lg:col-span-1" />
      </div>

      <Card
        title="Hành động quá hạn"
        subtitle={`Leo thang khi quá hạn hơn SLA của mức ưu tiên: Cao ${sla.High} ngày, Trung bình ${sla.Medium} ngày, Thấp ${sla.Low} ngày.`}
        icon={AlarmClock}
        padding="none"
        actions={
          escalations.length > 0 ? (
            <span data-print-hide>
              <Button
                size="sm"
                variant="secondary"
                icon={Copy}
                onClick={() =>
                  void copyWithFallback(escalationText(escalations, today), {
                    success: "Đã sao chép danh sách cần leo thang",
                    title: "Sao chép danh sách cần leo thang",
                  })
                }
              >
                Sao chép danh sách leo thang
              </Button>
            </span>
          ) : undefined
        }
      >
        {loading ? (
          <SkeletonCard rows={3} className="border-0 shadow-none" />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.item.id}
            onRowClick={(r) => onOpen(r.item)}
            rowLabel={(r) => `Mở hành động ${r.item.code}`}
            rowClassName={(r) => (r.escalate ? "bg-bad-soft/40" : undefined)}
            caption="Hành động quá hạn"
            emptyState={<EmptyState size="sm" tone="ok" icon={CircleCheck} title="Không có hành động quá hạn" description="Mọi hành động đang trong hạn xử lý." />}
            mobileCard={(r) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2 text-sm font-semibold text-brand-900">{r.item.title}</span>
                  <EscalationBadge row={r} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PriorityBadge priority={r.item.priority} size="sm" />
                  <DeadlineBadge item={r.item} today={today} />
                  <ScopeClassPill code={r.item.scopeClass} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <OwnerChip owner={r.item.owner} />
                  <span className="shrink-0 text-xs font-semibold text-brand-700">{canManage ? "Cập nhật ›" : "Xem ›"}</span>
                </div>
              </div>
            )}
          />
        )}
      </Card>

      {soon.length > 0 ? (
        <Card title="Sắp đến hạn" subtitle="Hành động chưa hoàn thành, đến hạn trong 2 ngày tới." icon={CalendarClock} padding="none">
          <ul className="divide-y divide-border">
            {soon.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => onOpen(i)}
                  className="flex min-h-14 w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-brand-50/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{i.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={i.priority} size="sm" />
                    <DeadlineBadge item={i} today={today} />
                    <OwnerChip owner={i.owner} className="max-w-44" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
