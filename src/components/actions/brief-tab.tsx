"use client";
/** "Bản tóm tắt quyết định" tab: period of the global filters (URL-synced) + the memo. */
import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import { Card, SegmentedControl } from "@/components/ui";
import { PERIOD_MODE_OPTIONS, PeriodPicker } from "@/components/app/shell";
import { useFilters } from "@/lib/client/filters";
import { buildDecisionBrief } from "@/lib/engine";
import type { ActionItem, LevelDataset, PeriodMode } from "@/lib/types";
import { DecisionBriefCard } from "./decision-brief";
import type { BriefRecommendation } from "./lib/action-form";

export interface BriefTabProps {
  ds: LevelDataset;
  today: string;
  actions?: readonly ActionItem[];
  canManage: boolean;
  onCreate: (rec: BriefRecommendation, periodLabel: string) => void;
  onOpenAction: (item: ActionItem) => void;
}

export function BriefTab({ ds, today, actions, canManage, onCreate, onOpenAction }: BriefTabProps) {
  const f = useFilters();
  const { period } = f.filters;
  const brief = useMemo(() => buildDecisionBrief(ds, period, today), [ds, period, today]);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="sm" data-print-hide>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-900">
            <CalendarRange aria-hidden className="size-[18px] text-brand-600" strokeWidth={2.25} />
            Kỳ báo cáo
          </div>
          <SegmentedControl<PeriodMode>
            options={PERIOD_MODE_OPTIONS}
            value={period.mode}
            onChange={(mode) => f.setFilters({ period: { mode } })}
            size="sm"
            ariaLabel="Loại kỳ báo cáo"
            className="max-w-full"
          />
          <PeriodPicker
            mode={period.mode}
            value={period.key}
            options={f.options}
            onChange={(key) => f.setFilters({ period: { mode: period.mode, key } })}
            className="min-w-0 lg:w-80"
          />
          <p className="text-xs leading-5 text-slate-500 lg:ml-auto lg:max-w-56 lg:text-right">Dùng chung kỳ với các màn hình thống kê.</p>
        </div>
      </Card>

      <DecisionBriefCard
        brief={brief}
        today={today}
        actions={actions}
        ragConfig={ds.config}
        canManage={canManage}
        onCreate={(rec) => onCreate(rec, brief.periodLabel)}
        onOpenAction={onOpenAction}
      />
    </div>
  );
}
