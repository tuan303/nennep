"use client";
/** Small building blocks shared by the ranking table (desktop) and the ranking cards (phones). */
import { Star } from "lucide-react";
import { Tooltip, cn } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { RankingRow } from "@/lib/types";

/** Teacher names longer than this also get a tab stop (keyboard access to the tooltip). */
const LONG_TEACHER = 22;

export function scoreTone(score: number): string {
  return score < 0 ? "text-bad-strong" : "text-brand-900";
}

export function HighlightChip() {
  return <span className="shrink-0 rounded bg-star-200 px-1.5 py-0.5 text-2xs font-bold text-star-900">Đang lọc</span>;
}

/** Class code (bold) + GVCN (muted, truncated to the column width, full text in a tooltip). */
export function ClassCell({ row }: { row: RankingRow }) {
  const teacher = row.homeroomTeacher?.trim();
  const teacherText = (
    <span
      tabIndex={teacher && teacher.length > LONG_TEACHER ? 0 : undefined}
      className="block truncate text-[12.5px] leading-4 text-slate-500 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      {teacher ? `GVCN ${teacher}` : "Chưa có GVCN"}
    </span>
  );
  return (
    <span className="flex min-w-[7.5rem] flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <span className="num text-[15px] font-bold text-brand-900">{row.classCode}</span>
        {row.highlighted ? <HighlightChip /> : null}
      </span>
      {teacher ? <Tooltip content={`GVCN: ${teacher}`}>{teacherText}</Tooltip> : teacherText}
    </span>
  );
}

export function RewardText({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num font-semibold", value > 0 ? "text-ok-strong" : "text-slate-400", className)}>
      {value > 0 ? `+${fmtNumber(value)}` : "0"}
    </span>
  );
}

export function PenaltyText({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num font-semibold", value > 0 ? "text-bad-strong" : "text-slate-400", className)}>
      {value > 0 ? `−${fmtNumber(value)}` : "0"}
    </span>
  );
}

/** Dashed separator between the last class inside Top 90% and the first one outside. */
export function Top90Divider({ as, colSpan, cutoff, ratio }: { as: "tr" | "li"; colSpan?: number; cutoff: number; ratio: number }) {
  const label = `Ngưỡng Top ${fmtPercent(ratio)}: hạng ≤ ${fmtNumber(cutoff)}`;
  const body = (
    <div role="separator" aria-label={label} className="flex items-center gap-3 px-4 py-1.5 sm:px-5">
      <span aria-hidden className="h-px flex-1 border-t-2 border-dashed border-star-400/80" />
      <span className="num inline-flex items-center gap-1.5 rounded-full bg-star-50 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-star-800 ring-1 ring-inset ring-star-400/50">
        <Star aria-hidden className="size-3 fill-star-500 text-star-600" />
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 border-t-2 border-dashed border-star-400/80" />
    </div>
  );
  if (as === "li") return <li className="bg-surface-2">{body}</li>;
  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-border bg-surface-2 p-0">
        {body}
      </td>
    </tr>
  );
}
