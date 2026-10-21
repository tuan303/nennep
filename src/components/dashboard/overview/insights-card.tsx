"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Info, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import { Card, buttonClasses, cn, toneTile, type Tone } from "@/components/ui";
import { buildDecisionBrief, type DecisionBrief } from "@/lib/engine";
import type { LevelDataset, Period } from "@/lib/types";

type Severity = DecisionBrief["findings"][number]["severity"];

const LOOK: Record<Severity, { tone: Tone; icon: LucideIcon; label: string }> = {
  high: { tone: "bad", icon: CircleAlert, label: "Cần xử lý ngay" },
  medium: { tone: "warn", icon: TriangleAlert, label: "Cần chú ý" },
  low: { tone: "brand", icon: Info, label: "Ghi nhận" },
};

export interface InsightsCardProps {
  ds: LevelDataset;
  period: Period;
  today: string;
  canOpenActions: boolean;
  /** Narrow column (next to "Cảnh báo sớm"): findings stacked, at most 2 side by side. */
  compact?: boolean;
  className?: string;
}

const MAX_FINDINGS = 3;

/** "Nhận định nhanh": the 3 most severe findings of the engine Decision Brief for the period (level-wide). */
export function InsightsCard({ ds, period, today, canOpenActions, compact, className }: InsightsCardProps) {
  const brief = useMemo(() => buildDecisionBrief(ds, period, today), [ds, period, today]);
  const findings = brief.findings.slice(0, MAX_FINDINGS);

  return (
    <Card
      className={className}
      icon={Lightbulb}
      title="Nhận định nhanh"
      subtitle={`Tự động tổng hợp cho toàn cấp học · ${brief.periodLabel}`}
      actions={
        canOpenActions ? (
          <Link href="/hanh-dong" className={buttonClasses({ variant: "ghost", size: "sm" })} data-print-hide>
            Báo cáo & hành động
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : undefined
      }
    >
      {findings.length === 0 ? (
        <p className="text-[13.5px] leading-relaxed text-slate-600">{brief.impact}</p>
      ) : (
        <ul className={cn("grid gap-3", findings.length > 1 && (compact ? "md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"))}>
          {findings.map((f) => {
            const look = LOOK[f.severity];
            const Icon = look.icon;
            return (
              <li key={f.title} className="flex gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-border">
                <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", toneTile[look.tone])}>
                  <Icon aria-hidden className="size-4" strokeWidth={2.25} />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-[13.5px] font-semibold leading-5 text-brand-900">
                    <span className="sr-only">{look.label}: </span>
                    {f.title}
                  </p>
                  <p className="line-clamp-3 text-[13px] leading-5 text-slate-600" title={f.detail}>
                    {f.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
