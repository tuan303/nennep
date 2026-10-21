"use client";
/** "Bản tóm tắt quyết định" tab: period of the global filters (URL-synced) + the memo. */
import { useMemo } from "react";
import { useFilters } from "@/lib/client/filters";
import { buildDecisionBrief } from "@/lib/engine";
import type { ActionItem, LevelDataset } from "@/lib/types";
import { DecisionBriefCard } from "./decision-brief";
import type { BriefRecommendation } from "./lib/action-form";
import { PeriodControl } from "./period-control";

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
      <PeriodControl />

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
