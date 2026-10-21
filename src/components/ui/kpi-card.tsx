import type { ReactNode } from "react";
import { ArrowUpRight, Info, type LucideIcon } from "lucide-react";
import { Sparkline } from "../charts/sparkline";
import { cn } from "./cn";
import { formatNumberVN } from "./format";
import { Skeleton } from "./skeleton";
import { StatTrend } from "./stat-trend";
import { toneHex, toneTile, type Tone } from "./tones";
import { Tooltip } from "./tooltip";

export interface KpiDelta {
  /** Signed change vs the previous period (KPI unit). */
  value: number;
  /** e.g. "so với tuần trước" */
  label?: string;
  goodWhen: "up" | "down";
  /** Custom number text (default "+12"). */
  display?: string;
}

export interface KpiCardProps {
  label: string;
  /** Numbers are formatted vi-VN (1.234,5); strings/nodes are rendered as given. */
  value: ReactNode;
  unit?: string;
  delta?: KpiDelta;
  icon?: LucideIcon;
  tone?: Tone;
  /** Explanation shown in a tooltip on an ⓘ next to the label. */
  hint?: string;
  /** Recent values (oldest → newest) drawn as a sparkline. */
  sparkline?: number[];
  /** Makes the whole card a button (drill-down). */
  onClick?: () => void;
  loading?: boolean;
  /** Extra line under the delta (small, muted). */
  footer?: ReactNode;
  className?: string;
}

/** KPI tile: icon, label, big tabular number, delta vs previous period, optional sparkline. */
export function KpiCard({ label, value, unit, delta, icon: Icon, tone = "brand", hint, sparkline, onClick, loading, footer, className }: KpiCardProps) {
  const shown = typeof value === "number" ? formatNumberVN(value) : value;
  const body = (
    <>
      {/* Wide card: [icon] label … [ⓘ ↗]. Narrow card (2-up on phones): [icon] … [ⓘ ↗] / label on its own line. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {Icon ? (
          <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset", toneTile[tone])}>
            <Icon aria-hidden className="size-[18px]" strokeWidth={2.25} />
          </span>
        ) : null}
        <span className="order-last min-w-0 basis-full text-[13px] font-medium leading-[18px] text-slate-600 @min-[220px]:order-none @min-[220px]:flex @min-[220px]:min-h-9 @min-[220px]:flex-1 @min-[220px]:basis-0 @min-[220px]:items-center">
          {label}
        </span>
        {hint || onClick ? (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {hint ? (
              <Tooltip content={hint}>
                <span
                  tabIndex={onClick ? -1 : 0}
                  aria-label={hint}
                  onClick={onClick ? (e) => e.stopPropagation() : undefined}
                  className="inline-flex size-6 items-center justify-center rounded-full text-slate-400 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <Info aria-hidden className="size-3.5" strokeWidth={2.25} />
                </span>
              </Tooltip>
            ) : null}
            {onClick ? (
              <ArrowUpRight
                aria-hidden
                className="size-4 text-slate-300 transition-[color,transform] duration-200 ease-soft group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600"
                strokeWidth={2.25}
              />
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-3 @min-[220px]:mt-3">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="my-1 h-7 w-24" />
          ) : (
            <p className="num flex items-baseline gap-1.5 truncate">
              <span className="text-2xl font-bold leading-9 tracking-tight text-brand-900 @min-[200px]:text-[28px]">{shown}</span>
              {unit ? <span className="text-[13px] font-medium text-slate-500">{unit}</span> : null}
            </p>
          )}
        </div>
        {sparkline && !loading ? (
          <Sparkline data={sparkline} color={toneHex[tone]} width={84} height={30} className="mb-1 hidden @min-[220px]:block" />
        ) : null}
      </div>

      {delta || footer ? (
        <div className="mt-2 flex min-h-6 flex-col gap-1">
          {delta && !loading ? <StatTrend value={delta.value} goodWhen={delta.goodWhen} label={delta.label} display={delta.display} size="sm" /> : null}
          {delta && loading ? <Skeleton className="h-5 w-32" /> : null}
          {footer ? <div className="text-xs text-slate-500">{footer}</div> : null}
        </div>
      ) : null}
    </>
  );

  const shell = cn("card group @container relative flex min-w-0 flex-col p-4 text-left", className);
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-busy={loading || undefined}
        className={cn(
          shell,
          "w-full transition-[box-shadow,transform,border-color] duration-200 ease-soft hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:translate-y-0",
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={shell} aria-busy={loading || undefined}>
      {body}
    </div>
  );
}
