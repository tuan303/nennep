"use client";
import { Camera, ChevronRight, EyeOff, MessageSquareText, User, UserPlus, Users } from "lucide-react";
import { Badge, DataCheckBadge, Pill, StatusBadge } from "@/components/ui";
import { FormulaText, ScopeBadge } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import type { Incident } from "@/lib/types";
import { incidentSubjects } from "./lib/class-view";

export interface IncidentItemProps {
  incident: Incident;
  /** Redacted for the viewer (GVCN, other class). */
  hidden: boolean;
  onOpen: (incident: Incident) => void;
  onOpenStudent: (studentId: string) => void;
}

/**
 * One incident of the timeline. The whole card opens the detail sheet (the title is the keyboard target);
 * student chips open the student history instead.
 */
export function IncidentItem({ incident: i, hidden, onOpen, onOpenStudent }: IncidentItemProps) {
  const subjects = incidentSubjects(i, hidden);
  const reporter = hidden ? undefined : i.reporter?.trim() || i.createdByName;
  const photos = i.photoIds.length + i.evidenceUrls.length;

  return (
    <article
      onClick={() => onOpen(i)}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-raised sm:p-3.5"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(i);
          }}
          aria-label={`Xem sự việc ${i.code}: ${i.issue}`}
          className="min-w-0 flex-1 rounded text-left text-sm font-semibold leading-5 text-brand-900 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <span className="num mr-1.5 inline-flex h-5 items-center rounded-md bg-surface-3 px-1.5 align-[1px] text-2xs font-bold text-slate-600 ring-1 ring-inset ring-border">
            {i.errorCode}
          </span>
          {i.issue}
        </button>
        <span className="num shrink-0 text-base font-bold leading-5 text-bad-strong">−{fmtNumber(i.points)}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-300 group-hover:text-brand-600" strokeWidth={2.25} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <FormulaText incident={i} showNote={false} />
        <span className="text-xs text-slate-400">{i.category}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {subjects.named.map((s) => (
          <Pill key={s.id} tone="brand" icon={User} onClick={() => onOpenStudent(s.id)} aria-label={`Xem lịch sử của ${s.name}`}>
            {s.name}
          </Pill>
        ))}
        {subjects.unnamed > 0 ? (
          <Badge tone="warn" size="md" icon={UserPlus}>
            {fmtNumber(subjects.unnamed)} HS chưa rõ tên
          </Badge>
        ) : null}
        {subjects.hiddenCount > 0 ? (
          <Badge tone="muted" size="md" icon={EyeOff}>
            {fmtNumber(subjects.hiddenCount)} HS (ẩn danh)
          </Badge>
        ) : null}
        {subjects.collective ? (
          <Badge tone="star" size="md" icon={Users}>
            Tập thể lớp
          </Badge>
        ) : null}
      </div>

      {!hidden && i.detail?.trim() ? (
        <p className="line-clamp-3 whitespace-pre-line text-[13px] leading-5 text-slate-700">{i.detail.trim()}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-slate-500">
        <StatusBadge status={i.status} size="sm" />
        <ScopeBadge scope={i.scope} size="sm" />
        {i.dataCheck !== "OK" ? <DataCheckBadge dataCheck={i.dataCheck} issues={i.dataIssues} size="sm" /> : null}
        {reporter ? <span>Người ghi: {reporter}</span> : null}
        {!hidden && i.gvcnNote ? (
          <span className="inline-flex items-center gap-1 text-brand-700">
            <MessageSquareText aria-hidden className="size-3.5" />
            Có phản hồi GVCN
          </span>
        ) : null}
        {photos > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Camera aria-hidden className="size-3.5" />
            {fmtNumber(photos)} minh chứng
          </span>
        ) : null}
      </div>
    </article>
  );
}
