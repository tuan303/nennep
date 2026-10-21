"use client";
/** Building blocks of the StudentHistorySheet. */
import { Cake, ChevronRight, Hash, School, type LucideIcon } from "lucide-react";
import { Avatar, StatusBadge, cn, toneTrack, type Tone } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import { formatDayMonthVN, weekdayLabelVN } from "@/lib/engine/dates";
import type { Incident, StudentLite } from "@/lib/types";
import { StudentStatusBadge } from "./badges";
import type { StudentErrorRow } from "./lib/student-summary";

export function StudentHeader({ student, gvcn }: { student: StudentLite; gvcn?: string }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar name={student.name} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StudentStatusBadge status={student.status} size="sm" />
        </div>
        <dl className="num flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
          <Meta icon={Hash} label="Mã HS" value={student.id} />
          <Meta icon={School} label="Lớp" value={gvcn ? `${student.classCode} · GVCN ${gvcn}` : student.classCode} />
          {student.dob ? <Meta icon={Cake} label="Ngày sinh" value={fmtDate(student.dob)} /> : null}
        </dl>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon aria-hidden className="size-3.5 shrink-0 text-slate-400" strokeWidth={2.25} />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  );
}

export function MiniStat({ label, value, tone = "brand", hint }: { label: string; value: number; tone?: Tone; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 py-2.5" title={hint}>
      <span className="text-xs font-medium leading-4 text-slate-500">{label}</span>
      <span className={cn("num text-[22px] font-bold leading-8 tracking-tight", tone === "bad" ? "text-bad-strong" : "text-brand-900")}>{fmtNumber(value)}</span>
    </div>
  );
}

export function ErrorBreakdown({ rows }: { rows: StudentErrorRow[] }) {
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.errorCode} className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-slate-800">
              <span className="num mr-1.5 font-semibold text-slate-500">{r.errorCode}</span>
              {r.issue}
            </span>
            <span className="num shrink-0 font-semibold text-slate-900">
              {fmtNumber(r.count)} lượt
              {r.points > 0 ? <span className="font-normal text-slate-500"> · {fmtNumber(r.points)} điểm</span> : null}
            </span>
          </div>
          <span aria-hidden className={cn("block h-1.5 w-full overflow-hidden rounded-full", toneTrack.bad)}>
            <span className="block h-full rounded-full bg-bad/80" style={{ width: `${(r.count / top) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HistoryTimeline({
  history,
  student,
  onOpenIncident,
}: {
  history: Incident[];
  student: StudentLite;
  onOpenIncident?: (incident: Incident) => void;
}) {
  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:bottom-2 before:left-[23px] before:top-2 before:w-px before:bg-border">
      {history.map((i) => {
        const body = <TimelineBody incident={i} student={student} />;
        return (
          <li key={i.id} className="relative flex gap-3">
            <div className="z-[1] flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface py-1 text-center ring-1 ring-border">
              <span className="num text-[13px] font-bold leading-5 text-brand-900">{formatDayMonthVN(i.date)}</span>
              <span className="text-2xs leading-4 text-slate-500">{weekdayShort(i.date)}</span>
            </div>
            {onOpenIncident ? (
              <button
                type="button"
                onClick={() => onOpenIncident(i)}
                aria-label={`Xem sự việc ${i.code}: ${i.issue}, ngày ${fmtDate(i.date)}`}
                className="group flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                {body}
                <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-300 group-hover:text-brand-600" strokeWidth={2.25} />
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 rounded-xl border border-border bg-surface p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function weekdayShort(date: string): string {
  const w = weekdayLabelVN(date);
  return w === "Chủ nhật" ? "CN" : w.replace("Thứ ", "T.");
}

function TimelineBody({ incident: i, student }: { incident: Incident; student: StudentLite }) {
  const perStudent = i.unit === "/HS";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold leading-5 text-brand-900">
          <span className="num mr-1.5 text-slate-500">{i.errorCode}</span>
          {i.issue}
        </p>
        <span className={cn("num shrink-0 text-sm font-bold", perStudent ? "text-bad-strong" : "text-slate-400")}>
          {perStudent ? `−${fmtNumber(i.penalty)}` : "0"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <StatusBadge status={i.status} size="sm" />
        <span>{weekdayLabelVN(i.date)}, {fmtDate(i.date)}</span>
        {i.classCode !== student.classCode ? <span>· Lớp lúc ghi: {i.classCode}</span> : null}
      </div>
      {!perStudent ? (
        <p className="num text-xs text-slate-500">Lỗi tính theo lần: lớp bị trừ {fmtNumber(i.points)} điểm, không tính cho cá nhân.</p>
      ) : null}
      {i.detail?.trim() ? <p className="whitespace-pre-line text-[13px] leading-5 text-slate-700">{i.detail.trim()}</p> : null}
      <p className="text-xs text-slate-500">Người ghi: {i.reporter?.trim() || i.createdByName}</p>
    </div>
  );
}
