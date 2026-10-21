"use client";
import { Award, Info } from "lucide-react";
import { Card, EmptyState, StatusBadge, cn } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { Reward, RewardStatus } from "@/lib/types";
import { isRewardCounted } from "./lib/report-model";

export interface ClassRewardsProps {
  rewards: Reward[];
  countedStatuses: RewardStatus[];
  className?: string;
}

function countedText(statuses: readonly RewardStatus[]): string {
  const list = statuses.map((s) => `“${s}”`).join(", ");
  return statuses.length === 1 ? `trạng thái ${list}` : `các trạng thái ${list}`;
}

/** "Điểm thưởng của lớp": every reward of the period; only counted statuses add to the score. */
export function ClassRewards({ rewards, countedStatuses, className }: ClassRewardsProps) {
  const counted = rewards.filter((r) => isRewardCounted(r, countedStatuses));
  const countedPoints = counted.reduce((s, r) => s + r.points, 0);

  return (
    <Card
      data-print-flow
      padding="none"
      icon={Award}
      title="Điểm thưởng của lớp"
      subtitle={
        rewards.length === 0
          ? "Các khoản thưởng trong kỳ"
          : `${fmtNumber(rewards.length)} khoản · ${fmtNumber(countedPoints)} điểm được tính vào thi đua`
      }
      className={className}
      footer={
        <span className="flex items-start gap-2 text-xs leading-5 text-slate-600">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-500" strokeWidth={2.25} />
          Chỉ điểm thưởng ở {countedText(countedStatuses)} được cộng vào điểm thi đua.
        </span>
      }
    >
      {rewards.length === 0 ? (
        <EmptyState size="sm" icon={Award} tone="star" title="Chưa có điểm thưởng trong kỳ này" description="Điểm thưởng của lớp sẽ hiển thị tại đây khi được ghi nhận." />
      ) : (
        <ul role="list" className="divide-y divide-border">
          {rewards.map((r) => {
            const isCounted = isRewardCounted(r, countedStatuses);
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <span
                  className={cn(
                    "num inline-flex h-9 min-w-12 shrink-0 items-center justify-center rounded-control px-2 text-sm font-bold ring-1 ring-inset",
                    isCounted ? "bg-ok-soft text-ok-strong ring-ok/20" : "bg-surface-3 text-slate-500 ring-border",
                  )}
                >
                  +{fmtNumber(r.points)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-5 text-slate-800">{r.reason}</span>
                  <span className="num text-xs text-slate-500">
                    {fmtDate(r.date)}
                    {isCounted ? "" : " · chưa tính vào điểm thi đua"}
                  </span>
                </span>
                <StatusBadge status={r.status} size="sm" />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
