"use client";
import { cn, toneTrack } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { IssueStat } from "@/lib/engine";

export interface IssueBarsProps {
  /** Engine topIssues output (already sorted). */
  issues: IssueStat[];
  /** Rows shown before "và N lỗi khác". */
  max?: number;
  /** Second line with Mảng and number of students. */
  details?: boolean;
  className?: string;
}

/** Errors as horizontal bars (length = penalty points), with "n lượt · −x" on the right. */
export function IssueBars({ issues, max = 6, details, className }: IssueBarsProps) {
  const shown = issues.slice(0, max);
  const hidden = issues.length - shown.length;
  const top = Math.max(1, ...shown.map((i) => i.points));
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {shown.map((i) => (
        <li key={i.errorCode} className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-slate-800" title={i.issue}>
              <span className="num mr-1.5 font-semibold text-slate-500">{i.errorCode}</span>
              {i.issue}
            </span>
            <span className="num shrink-0 text-slate-500">
              {fmtNumber(i.incidents)} lượt · <strong className="font-semibold text-bad-strong">−{fmtNumber(i.points)}</strong>
            </span>
          </div>
          <span aria-hidden className={cn("block h-1.5 w-full overflow-hidden rounded-full", toneTrack.bad)}>
            <span className="block h-full rounded-full bg-bad/80" style={{ width: `${(i.points / top) * 100}%` }} />
          </span>
          {details ? (
            <span className="num truncate text-xs text-slate-500">
              {i.category} · {fmtNumber(i.students)} lượt HS · {i.unit === "/HS" ? "tính theo HS" : "tính theo lần"}
            </span>
          ) : null}
        </li>
      ))}
      {hidden > 0 ? <li className="text-xs text-slate-500">và {fmtNumber(hidden)} lỗi khác</li> : null}
    </ul>
  );
}
