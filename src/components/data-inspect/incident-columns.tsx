"use client";
import { FileSpreadsheet, Smartphone } from "lucide-react";
import { Badge, DataCheckBadge, StatusBadge, cn, type DataTableColumn } from "@/components/ui";
import { PenaltyPill, ScopeBadge } from "@/components/app/widgets";
import { fmtDate, fmtPoints } from "@/lib/client/format";
import { weekdayLabelVN } from "@/lib/engine/dates";
import type { RosterNames } from "@/components/entry/lib/student-names";
import type { Incident } from "@/lib/types";
import { SOURCE_LABELS, countText, reporterOf, subjectsText } from "./lib/incident-rows";

export function PointsText({ points, className }: { points: number; className?: string }) {
  return <span className={cn("num font-bold", points > 0 ? "text-bad-strong" : "text-slate-400", className)}>{fmtPoints(-points)}</span>;
}

export function SourceBadge({ source, size = "sm" }: { source: Incident["source"]; size?: "sm" | "md" }) {
  return (
    <Badge tone={source === "import" ? "star" : "muted"} size={size} variant="outline" icon={source === "import" ? FileSpreadsheet : Smartphone}>
      {SOURCE_LABELS[source]}
    </Badge>
  );
}

export function ErrorCell({ i }: { i: Pick<Incident, "errorCode" | "issue" | "category"> }) {
  return (
    <div className="flex min-w-[220px] max-w-[340px] flex-col gap-0.5">
      <span className="line-clamp-2 text-slate-800">
        <span className="mr-1.5 rounded bg-surface-3 px-1 py-0.5 text-2xs font-bold text-slate-600">{i.errorCode}</span>
        {i.issue}
      </span>
      <span className="truncate text-xs text-slate-500">{i.category}</span>
    </div>
  );
}

export const INCIDENT_COLUMNS: ReadonlyArray<DataTableColumn<Incident>> = [
  {
    key: "code",
    header: "Mã",
    cell: (i) => <span className="num whitespace-nowrap text-[13px] font-semibold text-brand-900">{i.code}</span>,
    sortValue: (i) => i.code,
  },
  {
    key: "date",
    header: "Ngày",
    cell: (i) => (
      <span className="flex flex-col whitespace-nowrap">
        <span className="num">{fmtDate(i.date)}</span>
        <span className="text-xs text-slate-500">{weekdayLabelVN(i.date)}</span>
      </span>
    ),
    sortValue: (i) => i.date,
  },
  { key: "class", header: "Lớp", cell: (i) => <span className="font-bold text-brand-900">{i.classCode}</span>, sortValue: (i) => i.classCode },
  { key: "error", header: "Lỗi", cell: (i) => <ErrorCell i={i} />, sortValue: (i) => i.errorCode },
  { key: "unit", header: "Đơn vị", cell: (i) => <PenaltyPill penalty={i.penalty} unit={i.unit} /> },
  {
    key: "count",
    header: "Số HS/Số lần",
    cell: (i) => <span className="num whitespace-nowrap">{countText(i)}</span>,
    sortValue: (i) => (i.unit === "/HS" ? i.relatedStudentCount : i.occurrenceCount),
  },
  { key: "points", header: "Điểm", align: "right", cell: (i) => <PointsText points={i.points} />, sortValue: (i) => i.points },
  { key: "scope", header: "Phạm vi", cell: (i) => <ScopeBadge scope={i.scope} size="sm" /> },
  { key: "reporter", header: "Người ghi", cell: (i) => <span className="whitespace-nowrap text-[13px]">{reporterOf(i)}</span>, sortValue: (i) => reporterOf(i) },
  { key: "status", header: "Trạng thái", cell: (i) => <StatusBadge status={i.status} size="sm" />, sortValue: (i) => i.status },
  { key: "check", header: "Kiểm tra", cell: (i) => <DataCheckBadge dataCheck={i.dataCheck} issues={i.dataIssues} size="sm" />, sortValue: (i) => i.dataCheck },
  { key: "source", header: "Nguồn", cell: (i) => <SourceBadge source={i.source} />, sortValue: (i) => i.source },
];

/** Phone layout of one incident row (student names from `roster` when given). */
export function IncidentMobileCard({ i, roster }: { i: Incident; roster?: RosterNames }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="num truncate text-xs font-semibold text-slate-500">
          {i.code} · {fmtDate(i.date)}
        </span>
        <DataCheckBadge dataCheck={i.dataCheck} issues={i.dataIssues} size="sm" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-slate-800">
          <span className="font-bold text-brand-900">{i.classCode}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="font-semibold text-slate-600">{i.errorCode}</span> {i.issue}
        </p>
        <PointsText points={i.points} className="shrink-0 text-base" />
      </div>
      <p className="truncate text-[13px] text-slate-500">
        {countText(i)} · {subjectsText(i, roster)}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={i.status} size="sm" />
        <ScopeBadge scope={i.scope} size="sm" />
        <SourceBadge source={i.source} />
        <span className="truncate text-xs text-slate-500">{reporterOf(i)}</span>
      </div>
    </div>
  );
}
