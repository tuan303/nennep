"use client";
import { ArrowLeftRight, FileSpreadsheet, LogIn, LogOut, PencilLine, RotateCcw, UserPlus, type LucideIcon } from "lucide-react";
import { cn, toneTile } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import type { StudentEvent } from "@/lib/types";
import type { TimelineItem } from "./lib/timeline";

const ICONS: Record<StudentEvent["type"], LucideIcon> = {
  ENROLL: UserPlus,
  TRANSFER_IN: LogIn,
  TRANSFER_CLASS: ArrowLeftRight,
  TRANSFER_OUT: LogOut,
  REINSTATE: RotateCcw,
  UPDATE: PencilLine,
  IMPORT: FileSpreadsheet,
};

/** Vertical timeline of a student's record (tuyển mới, chuyển lớp, chuyển trường…), newest first. */
export function RecordTimeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:bottom-3 before:left-[17px] before:top-3 before:w-px before:bg-border">
      {items.map((item) => {
        const Icon = ICONS[item.type] ?? PencilLine;
        return (
          <li key={item.key} className="relative flex gap-3">
            <span className={cn("z-[1] inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", toneTile[item.tone])}>
              <Icon aria-hidden className="size-4" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="num min-w-0 text-sm font-semibold leading-5 text-brand-900">{item.title}</p>
                <span className="num shrink-0 text-xs font-medium text-slate-500">{fmtDate(item.date)}</span>
              </div>
              {item.detail ? <p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-slate-700">{item.detail}</p> : null}
              <p className="mt-1 truncate text-xs text-slate-500" title={item.by}>
                {item.by} · {fmtDateTime(item.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
