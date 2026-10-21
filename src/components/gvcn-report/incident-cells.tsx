"use client";
/** Cells and the phone card of the Báo GVCN detail table. */
import type { KeyboardEvent, MouseEvent } from "react";
import { MessageSquareReply, MessageSquareText, Users } from "lucide-react";
import { Badge, Button, StatusBadge, Tooltip } from "@/components/ui";
import { FormulaText, formulaInputOf, pointsFormula } from "@/components/app/widgets";
import { fmtDateTime, fmtNumber } from "@/lib/client/format";
import { formatDayMonthVN, weekdayLabelVN } from "@/lib/engine";
import type { Incident } from "@/lib/types";
import { subjectOf, subjectText } from "./lib/report-model";

export function DateCell({ date }: { date: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="num font-semibold text-brand-900">{formatDayMonthVN(date)}</span>
      <span className="text-xs text-slate-500">{weekdayLabelVN(date)}</span>
    </span>
  );
}

export function SubjectCell({ incident }: { incident: Incident }) {
  const s = subjectOf(incident);
  if (s.collective) {
    return (
      <Badge tone="star" size="sm" icon={Users}>
        Tập thể lớp
      </Badge>
    );
  }
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {s.names.length > 0 ? <span className="font-medium text-slate-900">{s.names.join(", ")}</span> : null}
      {s.hidden > 0 ? <span className="text-xs text-slate-500">{s.hidden} HS</span> : null}
      {s.unnamed > 0 ? (
        <span className="text-xs font-medium text-warn-strong">
          {s.names.length > 0 ? "+ " : ""}
          {s.unnamed} HS chưa rõ tên
        </span>
      ) : null}
    </span>
  );
}

export function IssueCell({ incident: i }: { incident: Incident }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="text-slate-800">{i.issue}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand" variant="outline" size="sm">
          {i.errorCode}
        </Badge>
        <span className="text-xs text-slate-500">{i.category}</span>
      </span>
    </span>
  );
}

/** Bold points; the formula ("2 điểm × 3 HS = 6") as a tooltip on screen and as a small line on paper. */
export function PointsCell({ incident }: { incident: Incident }) {
  const f = pointsFormula(formulaInputOf(incident), incident.points);
  const tip = f.note ? `${f.text} · ${f.note}` : f.text;
  return (
    <span className="inline-flex flex-col items-end">
      <Tooltip content={tip}>
        <span
          tabIndex={0}
          aria-label={`${fmtNumber(incident.points)} điểm. ${tip}`}
          className="num cursor-help rounded text-base font-bold text-bad-strong underline decoration-bad/30 decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500 print:no-underline"
        >
          {fmtNumber(incident.points)}
        </span>
      </Tooltip>
      <span className="hidden text-[10px] text-slate-500 print:block">{f.text.split(" = ")[0]}</span>
    </span>
  );
}

export function DetailCell({ text }: { text?: string }) {
  return text ? (
    <p className="line-clamp-3 min-w-40 whitespace-pre-line text-[13px] leading-5 text-slate-600 print:line-clamp-none">{text}</p>
  ) : (
    <span className="text-slate-400">–</span>
  );
}

export interface FeedbackCellProps {
  incident: Incident;
  /** Quick "Phản hồi" button (GVCN of the class). */
  onFeedback?: (i: Incident) => void;
}

export function FeedbackCell({ incident: i, onFeedback }: FeedbackCellProps) {
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();
  return (
    <span className="flex min-w-44 flex-col items-start gap-1.5">
      {i.gvcnNote?.trim() ? (
        <>
          <span className="line-clamp-3 whitespace-pre-line text-[13px] leading-5 text-slate-800 print:line-clamp-none">{i.gvcnNote.trim()}</span>
          {i.gvcnNoteAt ? <span className="num text-xs text-slate-500">{fmtDateTime(i.gvcnNoteAt)}</span> : null}
        </>
      ) : (
        <span className="text-[13px] italic text-slate-400">Chưa phản hồi</span>
      )}
      {onFeedback ? (
        <Button
          size="sm"
          variant="outline"
          icon={MessageSquareReply}
          data-print-hide
          onClick={(e) => {
            stop(e);
            onFeedback(i);
          }}
          onKeyDown={stop}
        >
          {i.gvcnNote?.trim() ? "Sửa phản hồi" : "Phản hồi"}
        </Button>
      ) : null}
    </span>
  );
}

/** Phone layout of one incident (the whole card opens the detail sheet, which holds the feedback form). */
export function IncidentCard({ incident: i, canFeedback }: { incident: Incident; canFeedback: boolean }) {
  return (
    <span className="flex flex-col gap-2">
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="num font-semibold text-brand-900">{formatDayMonthVN(i.date)}</span>
          <span className="text-xs text-slate-500">{weekdayLabelVN(i.date)}</span>
        </span>
        <StatusBadge status={i.status} size="sm" />
      </span>
      <span className="font-semibold text-slate-900">{subjectText(i)}</span>
      <span className="text-[13px] leading-5 text-slate-700">
        <span className="num mr-1.5 font-semibold text-brand-700">{i.errorCode}</span>
        {i.issue}
      </span>
      <FormulaText incident={i} className="text-[13px]" />
      {i.detail ? <span className="line-clamp-2 text-[13px] text-slate-500">{i.detail}</span> : null}
      {i.gvcnNote?.trim() ? (
        <span className="flex gap-2 rounded-lg border-l-4 border-star-500 bg-star-50/70 px-2.5 py-1.5 text-[13px] text-slate-700">
          <MessageSquareText aria-hidden className="mt-0.5 size-3.5 shrink-0 text-star-700" strokeWidth={2.25} />
          <span className="line-clamp-2">{i.gvcnNote.trim()}</span>
        </span>
      ) : canFeedback ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
          <MessageSquareReply aria-hidden className="size-3.5" strokeWidth={2.25} />
          Chạm để xem chi tiết và phản hồi
        </span>
      ) : null}
    </span>
  );
}
