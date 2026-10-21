"use client";
/** History timeline of an action (status changes and notes), newest first. */
import { ArrowRight } from "lucide-react";
import { StatusBadge, cn } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/client/format";
import { ACTION_STATUS_LABELS } from "@/lib/constants";
import type { ActionHistoryEntry } from "@/lib/types";

const DOT: Record<string, string> = {
  Open: "bg-brand-500",
  Doing: "bg-warn",
  Done: "bg-ok",
};

/** The server writes "Mới mở → Đang thực hiện" as the note of a plain status change – the badges already say it. */
function noteOf(h: ActionHistoryEntry): string | undefined {
  if (!h.note) return undefined;
  if (h.fromStatus && h.toStatus && h.note === `${ACTION_STATUS_LABELS[h.fromStatus]} → ${ACTION_STATUS_LABELS[h.toStatus]}`) return undefined;
  return h.note;
}

function whenText(at: string): string {
  const rel = fmtRelative(at);
  return rel && rel !== fmtDate(at) ? `${fmtDateTime(at)} (${rel})` : fmtDateTime(at);
}

export function ActionHistory({ history }: { history: readonly ActionHistoryEntry[] }) {
  if (history.length === 0) return <p className="text-sm text-slate-500">Chưa có lịch sử.</p>;
  const entries = [...history].reverse();
  return (
    <ol className="relative flex flex-col gap-4 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border-strong">
      {entries.map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative">
          <span
            aria-hidden
            className={cn("absolute -left-5 top-1.5 size-[11px] rounded-full ring-[3px] ring-surface", h.toStatus ? DOT[h.toStatus] : "bg-slate-300")}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {h.fromStatus ? (
              <>
                <StatusBadge status={h.fromStatus} size="sm" />
                <ArrowRight aria-label="chuyển sang" className="size-3.5 text-slate-400" />
              </>
            ) : null}
            {h.toStatus ? <StatusBadge status={h.toStatus} size="sm" /> : null}
            {!h.toStatus ? <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cập nhật</span> : null}
          </div>
          {noteOf(h) ? <p className="mt-1 text-sm leading-relaxed text-slate-800">{noteOf(h)}</p> : null}
          <p className="num mt-0.5 text-xs text-slate-500">
            <span className="font-medium text-slate-600">{h.by}</span> · <time dateTime={h.at}>{whenText(h.at)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
