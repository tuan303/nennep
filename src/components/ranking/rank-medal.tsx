"use client";
import { ArrowDown, ArrowUp, Equal } from "lucide-react";
import { cn, Tooltip } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { medalTier, type MedalTier } from "./lib/ranking-view";

const MEDAL: Record<MedalTier, string> = {
  gold: "bg-gradient-to-b from-star-300 to-star-500 text-brand-950 shadow-gold ring-1 ring-inset ring-star-600/40",
  silver: "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-800 ring-1 ring-inset ring-slate-400/60",
  bronze: "bg-gradient-to-b from-orange-100 to-orange-300 text-orange-900 ring-1 ring-inset ring-orange-400/60",
  none: "bg-muted-soft text-muted-strong ring-1 ring-inset ring-slate-300/50",
};

const MEDAL_NAME: Record<MedalTier, string> = { gold: "Huy chương vàng", silver: "Huy chương bạc", bronze: "Huy chương đồng", none: "" };

/** Rank number in a round badge: gold / silver / bronze for 1–3, neutral afterwards. */
export function RankMedal({ rank, size = "md", className }: { rank: number; size?: "sm" | "md" | "lg"; className?: string }) {
  const tier = medalTier(rank);
  const box = size === "sm" ? "size-7 text-xs" : size === "lg" ? "size-11 text-base" : "size-9 text-[13px]";
  return (
    <span
      role="img"
      aria-label={tier === "none" ? `Hạng ${rank}` : `Hạng ${rank} – ${MEDAL_NAME[tier]}`}
      className={cn("num inline-flex shrink-0 items-center justify-center rounded-full font-bold", box, MEDAL[tier], className)}
    >
      {rank}
    </span>
  );
}

/**
 * Rank movement vs the previous period: ▲2 (moved up), ▼1 (moved down), "=" (unchanged).
 * `delta` = previous rank − current rank; undefined renders "Mới" (not ranked before).
 */
export function RankDelta({
  delta,
  previousNoun,
  inert,
  className,
}: {
  delta: number | undefined;
  previousNoun: string;
  /** Inside another control (e.g. a card button): no tooltip / tab stop, text read via aria-label. */
  inert?: boolean;
  className?: string;
}) {
  if (delta === undefined) {
    return <span className={cn("text-2xs font-semibold text-slate-400", className)}>Mới</span>;
  }
  const up = delta > 0;
  const same = delta === 0;
  const Icon = same ? Equal : up ? ArrowUp : ArrowDown;
  const text = same ? `Giữ nguyên hạng so với ${previousNoun}` : `${up ? "Tăng" : "Giảm"} ${fmtNumber(Math.abs(delta))} bậc so với ${previousNoun}`;
  const chip = (
    <span
      tabIndex={inert ? undefined : 0}
      role="img"
      aria-label={text}
      className={cn(
        "num inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-2xs font-bold focus-visible:outline-2 focus-visible:outline-brand-500",
        same ? "bg-muted-soft text-muted-strong" : up ? "bg-ok-soft text-ok-strong" : "bg-bad-soft text-bad-strong",
        className,
      )}
    >
      <Icon aria-hidden className="size-3" strokeWidth={2.75} />
      {same ? null : fmtNumber(Math.abs(delta))}
    </span>
  );
  return inert ? chip : <Tooltip content={text}>{chip}</Tooltip>;
}
