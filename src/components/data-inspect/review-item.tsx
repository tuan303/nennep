"use client";
import Link from "next/link";
import { Eye, PencilLine, ScrollText, UserPlus } from "lucide-react";
import { Badge, Button, DataCheckBadge, buttonClasses } from "@/components/ui";
import { PenaltyPill, incidentEditHref } from "@/components/app/widgets";
import { fmtDate } from "@/lib/client/format";
import type { RosterNames } from "@/components/entry/lib/student-names";
import type { Incident } from "@/lib/types";
import { PointsText, SourceBadge } from "./incident-columns";
import { countText, subjectsText } from "./lib/incident-rows";
import { issueMeta } from "./lib/issue-meta";
import { canFixStudents, incidentIssueCodes, legacyNotes, needsFullEdit } from "./lib/review-queue";

export const NO_EDIT_RIGHTS = "Chỉ quản trị hoặc người tạo trong 24 giờ mới sửa được.";

export interface ReviewItemProps {
  incident: Incident;
  canEdit: boolean;
  onFix: (incident: Incident) => void;
  onOpen: (incident: Incident) => void;
  /** Current roster names (corrected names win over the names recorded on the incident). */
  roster?: RosterNames;
}

/** One record of the review queue: what is wrong, legacy notes, and the fitting fix action. */
export function ReviewItem({ incident: i, canEdit, onFix, onOpen, roster }: ReviewItemProps) {
  const codes = incidentIssueCodes(i);
  const notes = legacyNotes(i);
  const fixable = canFixStudents(i);
  const fullEdit = needsFullEdit(i);
  const otherIssues = i.dataIssues.filter((d) => d.code !== "LEGACY_NOTE");

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
          <span className="num font-semibold text-brand-900">{i.code}</span>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <span className="num text-slate-600">{fmtDate(i.date)}</span>
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-800">Lớp {i.classCode}</span>
          <DataCheckBadge dataCheck={i.dataCheck} size="sm" />
          <SourceBadge source={i.source} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="min-w-0 text-[15px] font-medium text-slate-800">
            <span className="mr-1 font-bold text-slate-500">{i.errorCode}</span>
            {i.issue}
          </p>
          <PenaltyPill penalty={i.penalty} unit={i.unit} />
          <PointsText points={i.points} className="text-sm" />
        </div>
        <p className="text-[13px] text-slate-500">
          {countText(i)} · {subjectsText(i, roster)}
        </p>

        {notes.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-control bg-star-50 px-3 py-2.5 ring-1 ring-inset ring-star-500/35">
            <ScrollText aria-hidden className="mt-0.5 size-4 shrink-0 text-star-700" strokeWidth={2.25} />
            <div className="min-w-0">
              <p className="text-2xs font-bold uppercase tracking-wide text-star-800">Ghi chú trong file cũ</p>
              {notes.map((n, k) => (
                <p key={k} className="text-[15px] font-semibold text-brand-950">
                  {n}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <ul className="flex flex-col gap-1.5" aria-label="Vấn đề dữ liệu">
          {otherIssues.length === 0 && codes.length > 0 && !codes.includes("LEGACY_NOTE") ? (
            <li className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
              <Badge tone={issueMeta(codes[0]).tone} size="sm">
                {issueMeta(codes[0]).label}
              </Badge>
              {issueMeta(codes[0]).explanation}
            </li>
          ) : null}
          {otherIssues.map((d, k) => (
            <li key={`${d.code}-${k}`} className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
              <Badge tone={issueMeta(d.code).tone} size="sm">
                {issueMeta(d.code).label}
              </Badge>
              <span className="min-w-0">{d.message}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-52 lg:flex-col lg:items-stretch" data-print-hide>
        {fixable ? (
          <Button variant="primary" size="sm" icon={UserPlus} onClick={() => onFix(i)}>
            Bổ sung học sinh
          </Button>
        ) : null}
        {fullEdit && canEdit ? (
          <Link href={incidentEditHref(i.id)} className={buttonClasses({ variant: fixable ? "secondary" : "primary", size: "sm" })}>
            <PencilLine aria-hidden className="size-4" strokeWidth={2.25} />
            Mở để sửa
          </Link>
        ) : null}
        <Button variant="ghost" size="sm" icon={Eye} onClick={() => onOpen(i)}>
          Xem chi tiết
        </Button>
        {!canEdit ? <p className="text-xs leading-snug text-slate-500 lg:text-right">{NO_EDIT_RIGHTS}</p> : null}
      </div>
    </li>
  );
}
