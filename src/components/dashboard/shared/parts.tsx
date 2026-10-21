"use client";
/** Small composition pieces shared by the dashboard cards (built from kit tokens and tone maps). */
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn, toneFill, toneSoft, toneTile, type Tone } from "@/components/ui";
import { RAG_LABELS } from "@/lib/constants";
import type { RagStatus } from "@/lib/types";
import { fmtNumber } from "@/lib/client/format";

/* --------------------------------- Notice -------------------------------- */

export interface NoticeProps {
  tone?: Tone;
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Inline banner (status, not an error dialog): icon tile, title, short text and an optional action. */
export function Notice({ tone = "warn", icon: Icon, title, children, action, className }: NoticeProps) {
  return (
    <div role="status" className={cn("flex flex-col gap-3 rounded-card px-4 py-3 ring-1 ring-inset sm:flex-row sm:items-center", toneSoft[tone], className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface/70 ring-1 ring-inset", toneTile[tone])}>
          <Icon aria-hidden className="size-[18px]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 text-[13px] leading-5">
          <p className="font-semibold">{title}</p>
          {children ? <div className="opacity-90">{children}</div> : null}
        </div>
      </div>
      {action ? (
        <div className="shrink-0 sm:ml-auto" data-print-hide>
          {action}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- Row button ------------------------------ */

export interface RowButtonProps {
  onClick: () => void;
  /** Accessible name (the visible content is usually several pieces). */
  label: string;
  children: ReactNode;
  highlighted?: boolean;
  /** Hide the trailing chevron. */
  plain?: boolean;
  className?: string;
}

/** Full-width list row acting as a button (≥ 44px tall), used for every drill-down list of the dashboard. */
export function RowButton({ onClick, label, children, highlighted, plain, className }: RowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150",
        "hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
        highlighted && "bg-star-50 ring-1 ring-inset ring-star-500/40 hover:bg-star-50",
        className,
      )}
    >
      {children}
      {plain ? null : (
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-slate-300 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600"
          strokeWidth={2.25}
        />
      )}
    </button>
  );
}

/** Rank bubble 1…n (gold for the first). */
export function RankBubble({ n, tone }: { n: number; tone?: Tone }) {
  const t: Tone = tone ?? (n === 1 ? "star" : "brand");
  return (
    <span aria-hidden className={cn("num inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset", toneTile[t])}>
      {n}
    </span>
  );
}

/** Label + value pair (KPI-like, compact). */
export function MiniStat({ label, value, tone, className }: { label: ReactNode; value: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="truncate text-xs font-medium text-slate-500">{label}</span>
      <span className={cn("num text-lg font-bold leading-6 tracking-tight", tone === "bad" ? "text-bad-strong" : tone === "ok" ? "text-ok-strong" : tone === "star" ? "text-star-800" : "text-brand-900")}>
        {value}
      </span>
    </span>
  );
}

/* -------------------------------- RAG strip ------------------------------- */

const RAG_STRIP_ORDER: readonly RagStatus[] = ["RED", "YELLOW", "GREEN", "GRAY"];
const RAG_TONE: Record<RagStatus, Tone> = { GREEN: "ok", YELLOW: "warn", RED: "bad", GRAY: "muted" };

/** Stacked horizontal meter of RAG counts (colour + accessible text; the tiles/legend next to it carry the labels). */
export function RagStrip({ counts, total, className }: { counts: Record<RagStatus, number>; total: number; className?: string }) {
  const text = RAG_STRIP_ORDER.map((r) => `${RAG_LABELS[r]}: ${fmtNumber(counts[r])}`).join("; ");
  return (
    <span role="img" aria-label={`Phân bố trạng thái ${fmtNumber(total)} lớp. ${text}`} className={cn("flex h-3 w-full overflow-hidden rounded-full bg-muted-soft", className)}>
      {total > 0
        ? RAG_STRIP_ORDER.filter((r) => counts[r] > 0).map((r) => (
            <span
              key={r}
              className={cn("h-full border-r-2 border-surface last:border-r-0", RAG_TONE[r] === "warn" ? "bg-warn-fill" : toneFill[RAG_TONE[r]])}
              style={{ width: `${(counts[r] / total) * 100}%` }}
            />
          ))
        : null}
    </span>
  );
}

export { RAG_TONE };
