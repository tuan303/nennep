"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ClipboardList, History, Pencil } from "lucide-react";
import { incidentEditHref, useNow } from "@/components/app/widgets";
import { canEditIncident } from "@/components/app/widgets/lib/incident-access";
import { Badge, Card, EmptyState, StatusBadge, buttonClasses, cn } from "@/components/ui";
import { fmtNumber, fmtTime } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import { formatDayMonthVN } from "@/lib/engine/dates";
import type { Incident, LevelDataset } from "@/lib/types";
import { createdDayVN, myRecentIncidents, myTodaySummary, subjectSummary } from "./lib/recent";
import { rosterNames, type RosterNames } from "./lib/student-names";

export interface RecentPanelProps {
  ds: LevelDataset;
  today: string;
  /** Id of the incident open in the form (highlighted). */
  editingId?: string;
  onOpen: (incident: Incident) => void;
  className?: string;
}

/** "Ghi nhận gần đây": the signed-in user's latest 15 incidents of this level, with today's counter. */
export function RecentPanel({ ds, today, editingId, onOpen, className }: RecentPanelProps) {
  const { profile } = useSession();
  const uid = profile?.uid ?? "";
  const now = useNow();
  const recent = useMemo(() => myRecentIncidents(ds.incidents, uid), [ds.incidents, uid]);
  const todayStats = useMemo(() => myTodaySummary(ds.incidents, uid, today), [ds.incidents, uid, today]);
  const roster = useMemo(() => rosterNames(ds.students), [ds.students]);

  return (
    <Card
      padding="none"
      headingLevel={2}
      icon={History}
      title="Ghi nhận gần đây"
      subtitle="Sự việc thầy/cô vừa ghi nhận – chạm để xem, sửa trong 24 giờ."
      className={className}
      actions={
        <Badge tone={todayStats.count > 0 ? "brand" : "muted"} size="md" className="num">
          Hôm nay: {fmtNumber(todayStats.count)} sự việc · {fmtNumber(todayStats.points)} điểm trừ
        </Badge>
      }
    >
      {recent.length === 0 ? (
        <EmptyState
          size="sm"
          icon={ClipboardList}
          title="Chưa có sự việc nào do thầy/cô ghi nhận"
          description="Các sự việc vừa lưu sẽ hiện ở đây để kiểm tra nhanh và sửa trong 24 giờ."
        />
      ) : (
        <ul role="list" className="divide-y divide-border border-t border-border">
          {recent.map((i) => (
            <RecentRow
              key={i.id}
              incident={i}
              today={today}
              editing={i.id === editingId}
              canEdit={canEditIncident(profile, i, now)}
              onOpen={onOpen}
              roster={roster}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

interface RecentRowProps {
  incident: Incident;
  today: string;
  editing: boolean;
  canEdit: boolean;
  onOpen: (i: Incident) => void;
  roster: RosterNames;
}

function RecentRow({ incident: i, today, editing, canEdit, onOpen, roster }: RecentRowProps) {
  const day = createdDayVN(i);
  const dayLabel = day === today ? "Hôm nay" : day ? formatDayMonthVN(day) : "";
  const backdated = i.date !== day;
  return (
    <li className={cn("flex items-stretch gap-1 pr-2 transition-colors", editing && "bg-star-50/70")}>
      <button
        type="button"
        onClick={() => onOpen(i)}
        aria-label={`Xem sự việc ${i.code}: lớp ${i.classCode}, ${i.issue}, ${fmtNumber(i.points)} điểm trừ`}
        className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left transition-colors hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 sm:pl-5"
      >
        <span className="num flex w-12 shrink-0 flex-col items-start pt-0.5">
          <span className="text-sm font-semibold text-slate-800">{fmtTime(i.createdAt)}</span>
          <span className="text-2xs text-slate-500">{dayLabel}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-start gap-1.5">
            <Badge tone="brand" size="sm" variant="outline" className="num mt-px shrink-0">
              {i.classCode}
            </Badge>
            <span className="line-clamp-2 min-w-0 text-sm font-medium leading-5 text-slate-900 sm:line-clamp-1">{i.issue}</span>
          </span>
          <span className="truncate text-xs text-slate-500">
            {subjectSummary(i, 2, roster)}
            {backdated ? ` · ngày ${formatDayMonthVN(i.date)}` : ""}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={i.status} size="sm" />
            {editing ? (
              <Badge tone="star" size="sm">
                Đang sửa
              </Badge>
            ) : null}
          </span>
        </span>
        <span className="num shrink-0 pt-0.5 text-right text-[15px] font-bold text-bad-strong">{i.points > 0 ? `−${fmtNumber(i.points)}` : "0"}</span>
      </button>
      {canEdit && !editing ? (
        <Link href={incidentEditHref(i.id)} scroll={false} className={buttonClasses({ variant: "ghost", size: "sm", className: "min-w-11 self-center px-2.5 text-brand-700" })} aria-label={`Sửa sự việc ${i.code}`}>
          <Pencil aria-hidden className="size-4" strokeWidth={2.25} />
          <span className="max-sm:sr-only">Sửa</span>
        </Link>
      ) : null}
    </li>
  );
}
