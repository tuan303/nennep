"use client";
/** Kanban view of the Action Register: Mới mở | Đang thực hiện | Hoàn thành (stacked on phones). */
import { useState } from "react";
import { ChevronDown, CircleCheck, CircleDashed, LoaderCircle, type LucideIcon } from "lucide-react";
import { Button, PriorityBadge, cn } from "@/components/ui";
import { ACTION_STATUS_LABELS } from "@/lib/constants";
import type { ActionItem, ActionStatus } from "@/lib/types";
import { DeadlineBadge, OwnerChip, ScopeClassPill } from "./action-bits";
import { KANBAN_COLUMNS, groupByStatus, isOverdue } from "./lib/action-view";

const COLUMN_LOOK: Record<ActionStatus, { icon: LucideIcon; bar: string; text: string }> = {
  Open: { icon: CircleDashed, bar: "bg-brand-500", text: "text-brand-700" },
  Doing: { icon: LoaderCircle, bar: "bg-warn", text: "text-warn-strong" },
  Done: { icon: CircleCheck, bar: "bg-ok", text: "text-ok-strong" },
};

const DONE_PAGE = 6;

export function ActionCard({ item, today, onOpen }: { item: ActionItem; today: string; onOpen: (item: ActionItem) => void }) {
  const overdue = isOverdue(item, today);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Xem hành động ${item.code}: ${item.title}`}
      className={cn(
        "card group flex w-full flex-col gap-2.5 p-3.5 text-left transition-[box-shadow,transform,border-color] duration-200 ease-soft",
        "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        overdue && "border-l-4 border-l-bad",
        item.status === "Done" && "bg-surface-2/60",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="num truncate text-2xs font-semibold uppercase tracking-wider text-slate-400">{item.code}</span>
        <PriorityBadge priority={item.priority} size="sm" />
      </span>
      <span className={cn("line-clamp-3 text-sm font-semibold leading-5 text-brand-900", item.status === "Done" && "text-slate-600")}>{item.title}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <DeadlineBadge item={item} today={today} />
        <ScopeClassPill code={item.scopeClass} />
      </span>
      <span className="flex items-center border-t border-border pt-2.5">
        <OwnerChip owner={item.owner} />
      </span>
    </button>
  );
}

function Column({ status, items, today, onOpen }: { status: ActionStatus; items: ActionItem[]; today: string; onOpen: (item: ActionItem) => void }) {
  const look = COLUMN_LOOK[status];
  const Icon = look.icon;
  const [limit, setLimit] = useState(status === "Done" ? DONE_PAGE : Number.POSITIVE_INFINITY);
  const visible = items.slice(0, limit);
  const rest = items.length - visible.length;
  return (
    <section aria-label={`${ACTION_STATUS_LABELS[status]} (${items.length})`} className="flex min-w-0 flex-col gap-2.5 rounded-card bg-surface-3/70 p-2.5 ring-1 ring-inset ring-border sm:p-3">
      <header className="flex items-center gap-2 px-1 pt-0.5">
        <span aria-hidden className={cn("h-4 w-1 rounded-full", look.bar)} />
        <Icon aria-hidden className={cn("size-4", look.text)} strokeWidth={2.25} />
        <h3 className="text-sm font-semibold text-brand-900">{ACTION_STATUS_LABELS[status]}</h3>
        <span className="num ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface px-2 text-xs font-bold text-slate-600 ring-1 ring-inset ring-border">
          {items.length}
        </span>
      </header>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-3 py-6 text-center text-[13px] text-slate-500">Chưa có hành động</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((i) => (
            <li key={i.id}>
              <ActionCard item={i} today={today} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? (
        <Button variant="ghost" size="sm" iconRight={ChevronDown} onClick={() => setLimit((l) => l + DONE_PAGE)}>
          Xem thêm {Math.min(rest, DONE_PAGE)} hành động
        </Button>
      ) : null}
    </section>
  );
}

export function ActionKanban({ items, today, onOpen }: { items: readonly ActionItem[]; today: string; onOpen: (item: ActionItem) => void }) {
  const groups = groupByStatus(items);
  return (
    <div className="grid items-start gap-4 md:grid-cols-3">
      {KANBAN_COLUMNS.map((s) => (
        <Column key={s} status={s} items={groups[s]} today={today} onOpen={onOpen} />
      ))}
    </div>
  );
}
