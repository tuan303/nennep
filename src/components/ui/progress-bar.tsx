import type { ReactNode } from "react";
import { cn } from "./cn";
import { formatPercentVN } from "./format";
import { toneFill, toneTrack, type Tone } from "./tones";

export interface ProgressBarProps {
  /** 0..1 (clamped). */
  value: number;
  tone?: Tone;
  size?: "sm" | "md";
  /** Visible label above the bar (left). */
  label?: ReactNode;
  /** Show the percentage on the right of the label row. */
  showValue?: boolean;
  /** Custom right-side text instead of the percentage (e.g. "38/50 lớp"). */
  valueText?: string;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  className?: string;
}

/** Horizontal meter. The track is a lighter step of the same hue so the state reads across the whole bar. */
export function ProgressBar({ value, tone = "brand", size = "md", label, showValue, valueText, ariaLabel, className }: ProgressBarProps) {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const text = valueText ?? formatPercentVN(v);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label != null || showValue ? (
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="min-w-0 truncate font-medium text-slate-700">{label}</span>
          {showValue ? <span className="num shrink-0 font-semibold text-slate-900">{text}</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={typeof label === "string" ? label : ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        aria-valuetext={text}
        className={cn("w-full overflow-hidden rounded-full", toneTrack[tone], size === "sm" ? "h-1.5" : "h-2.5")}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-soft", toneFill[tone])}
          style={{ width: `${v * 100}%` }}
        />
      </div>
    </div>
  );
}
