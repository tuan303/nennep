"use client";
/** "Đề xuất hành động" of the Decision Brief, each with a "Tạo hành động" shortcut (actions.manage). */
import { CalendarClock, ListPlus, Link2 } from "lucide-react";
import { Badge, Button, PriorityBadge, StatusBadge } from "@/components/ui";
import { formatDateVN } from "@/lib/engine";
import type { ActionItem } from "@/lib/types";
import { OwnerChip, ScopeClassPill } from "./action-bits";
import type { BriefRecommendation } from "./lib/action-form";
import { findExistingAction } from "./lib/action-view";
import { recommendationDeadline } from "./lib/brief-text";

export interface BriefRecommendationsProps {
  recommendations: BriefRecommendation[];
  today: string;
  /** Loaded actions (to show "Đã có hành động" instead of creating a duplicate); undefined while loading. */
  actions?: readonly ActionItem[];
  canManage: boolean;
  onCreate: (rec: BriefRecommendation) => void;
  onOpenAction: (item: ActionItem) => void;
}

export function BriefRecommendations({ recommendations, today, actions, canManage, onCreate, onOpenAction }: BriefRecommendationsProps) {
  return (
    <ol className="flex flex-col gap-2.5">
      {recommendations.map((rec, i) => {
        const due = recommendationDeadline(today, rec.deadlineDays);
        const existing = actions ? findExistingAction(actions, rec.title) : undefined;
        return (
          <li
            key={`${i}-${rec.title}`}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 sm:flex-row sm:items-start sm:gap-4 xl:flex-col xl:items-stretch xl:gap-2.5"
          >
            <div className="flex min-w-0 flex-1 gap-3">
              <span aria-hidden className="num mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white print:border print:border-brand-900 print:bg-transparent print:text-brand-900">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-sm font-semibold leading-5 text-slate-900">{rec.title}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <PriorityBadge priority={rec.priority} size="sm" />
                  <Badge tone="muted" size="sm" icon={CalendarClock} title="Hạn đề xuất = hôm nay + SLA của mức ưu tiên">
                    Hạn {formatDateVN(due)} · {rec.deadlineDays} ngày
                  </Badge>
                  <ScopeClassPill code={rec.scopeClass} />
                  <OwnerChip owner={rec.owner} />
                </div>
              </div>
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-2 pl-10 empty:hidden sm:max-w-64 sm:pl-0 xl:max-w-none xl:pl-10" data-print-hide>
              {existing ? (
                <button
                  type="button"
                  onClick={() => onOpenAction(existing)}
                  title="Mở hành động đã tạo từ đề xuất này"
                  className="inline-flex min-h-10 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-control px-2.5 py-1.5 text-left text-[13px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Link2 aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
                    Đã có hành động
                  </span>
                  <span className="num">{existing.code}</span>
                  <StatusBadge status={existing.status} size="sm" />
                </button>
              ) : canManage ? (
                <Button variant="outline" size="sm" icon={ListPlus} onClick={() => onCreate(rec)}>
                  Tạo hành động
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
