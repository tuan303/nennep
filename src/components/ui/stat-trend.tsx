import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "./cn";
import { formatSignedVN } from "./format";

export interface StatTrendProps {
  /** Signed change vs the previous period, in the KPI's own unit. */
  value: number;
  /** Whether an increase is good ("up", e.g. Điểm thưởng) or bad ("down" is good, e.g. Sự việc). */
  goodWhen: "up" | "down";
  /** Comparison text, e.g. "so với tuần trước". */
  label?: string;
  /** Custom text for the number (default: signed VN number, e.g. "+12", "−3,5"). */
  display?: string;
  size?: "sm" | "md";
  className?: string;
}

/** Delta chip: arrow + signed value, green when the change is good, red when bad, gray when unchanged. */
export function StatTrend({ value, goodWhen, label, display, size = "md", className }: StatTrendProps) {
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const good = dir === "flat" ? null : dir === goodWhen;
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const verb = dir === "up" ? "Tăng" : dir === "down" ? "Giảm" : "Không đổi";
  const text = display ?? (dir === "flat" ? "0" : formatSignedVN(value));
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", size === "sm" ? "text-xs" : "text-[13px]", className)}>
      <span
        className={cn(
          "num inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
          good === null && "bg-muted-soft text-muted-strong",
          good === true && "bg-ok-soft text-ok-strong",
          good === false && "bg-bad-soft text-bad-strong",
        )}
      >
        <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.75} />
        <span className="sr-only">{verb} </span>
        {text}
        {good !== null ? <span className="sr-only">{good ? " (tích cực)" : " (cần chú ý)"}</span> : null}
      </span>
      {label ? <span className="text-slate-500">{label}</span> : null}
    </span>
  );
}
