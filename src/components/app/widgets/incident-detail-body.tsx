"use client";
/** Read-only blocks of the IncidentDetailSheet. */
import type { ReactNode } from "react";
import { ChevronRight, ShieldOff, UserRoundX, Users } from "lucide-react";
import { Avatar, DataCheckBadge, StatusBadge, cn } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/client/format";
import { STUDENT_STATUS_LABELS } from "@/lib/constants";
import { weekdayLabelVN } from "@/lib/engine/dates";
import { periodLabel } from "@/lib/engine/period";
import type { Incident, LevelDataset, StudentLite } from "@/lib/types";
import { PenaltyPill, ScopeBadge } from "./badges";
import { FormulaText } from "./formula-text";

export function DetailSection({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
        {aside ? <div className="text-xs text-slate-500">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function IncidentSummary({ incident: i }: { incident: Incident }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-gradient-to-b from-surface to-surface-2 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">{i.category}</p>
        <p className="text-[15px] font-semibold leading-6 text-brand-900">
          <span className="num mr-1.5 rounded bg-surface-3 px-1.5 py-0.5 text-[13px] text-slate-600">{i.errorCode}</span>
          {i.issue}
        </p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p className="num flex items-baseline gap-1.5">
          <span className="text-[32px] font-bold leading-none tracking-tight text-bad-strong">{i.points > 0 ? `−${fmtNumber(i.points)}` : "0"}</span>
          <span className="text-[13px] font-medium text-slate-500">điểm trừ</span>
        </p>
        <FormulaText incident={i} icon className="text-[13px]" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={i.status} size="sm" />
        <ScopeBadge scope={i.scope} size="sm" />
        <PenaltyPill penalty={i.penalty} unit={i.unit} />
        <DataCheckBadge dataCheck={i.dataCheck} issues={i.dataIssues} size="sm" />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-border py-2 last:border-b-0 [&:nth-last-child(2):nth-child(odd)]:border-b-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="num min-w-0 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function IncidentInfo({ ds, incident: i, redacted }: { ds: LevelDataset; incident: Incident; redacted: boolean }) {
  const gvcn = ds.classes.find((c) => c.code === i.classCode)?.homeroomTeacher;
  return (
    <dl className="grid grid-cols-2 gap-x-4 rounded-card border border-border bg-surface px-3.5 py-1 sm:gap-x-6 sm:px-4">
      <Row label="Ngày">
        {weekdayLabelVN(i.date)}, {fmtDate(i.date)}
      </Row>
      <Row label="Tuần">{periodLabel({ mode: "week", key: i.week }, ds.config.semesters).replace(/^Tuần /, "")}</Row>
      <Row label="Lớp">
        {i.classCode} · Khối {i.grade}
      </Row>
      <Row label="GVCN">{gvcn || "Chưa có thông tin"}</Row>
      <Row label="Mức trừ">
        {fmtNumber(i.penalty)} điểm/{i.unit === "/HS" ? "học sinh" : "lần"}
        {i.group ? <span className="text-slate-500"> · {i.group}</span> : null}
      </Row>
      {i.unit === "/lần" ? <Row label="Số lần vi phạm">{fmtNumber(i.occurrenceCount)}</Row> : <Row label="Số học sinh">{fmtNumber(i.relatedStudentCount)}</Row>}
      {!redacted ? <Row label="Người ghi">{i.reporter?.trim() || i.createdByName || "Chưa có thông tin"}</Row> : null}
      <Row label="Mã sự việc">{i.code}</Row>
    </dl>
  );
}

export function RedactedNotice() {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-muted-soft px-3 py-2.5 text-[13px] leading-5 text-muted-strong">
      <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
      Lớp này không thuộc lớp chủ nhiệm của thầy/cô nên tên học sinh, chi tiết, phản hồi và minh chứng được ẩn.
    </p>
  );
}

interface StudentsProps {
  incident: Incident;
  roster: Map<string, StudentLite>;
  onOpenStudent?: (studentId: string) => void;
}

export function IncidentStudents({ incident: i, roster, onOpenStudent }: StudentsProps) {
  if (i.students.length === 0 && i.unnamedCount === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-border-strong px-3 py-2.5 text-sm text-slate-600">
        <Users aria-hidden className="size-4 shrink-0 text-slate-400" strokeWidth={2.25} />
        {i.scope === "Tập thể" ? "Tập thể lớp" : "Không có học sinh được ghi tên"}
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {i.students.map((ref) => {
        const now = roster.get(ref.id);
        const moved = now && now.classCode !== ref.classCode ? `Hiện ở lớp ${now.classCode}` : undefined;
        const inactive = now && now.status !== "ACTIVE" ? STUDENT_STATUS_LABELS[now.status] : undefined;
        const content = (
          <>
            <Avatar name={ref.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{now?.name ?? ref.name}</span>
              <span className="num block truncate text-xs text-slate-500">
                {ref.id}
                {ref.classCode !== i.classCode ? ` · lớp lúc ghi ${ref.classCode}` : ""}
                {moved ? ` · ${moved}` : ""}
                {inactive ? ` · ${inactive}` : ""}
              </span>
            </span>
          </>
        );
        return (
          <li key={ref.id}>
            {onOpenStudent ? (
              <button
                type="button"
                onClick={() => onOpenStudent(ref.id)}
                aria-label={`Xem lịch sử của ${ref.name}`}
                className="group flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
              >
                {content}
                <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-300 group-hover:text-brand-600" strokeWidth={2.25} />
              </button>
            ) : (
              <div className="flex min-h-12 items-center gap-3 px-3 py-2">{content}</div>
            )}
          </li>
        );
      })}
      {i.unnamedCount > 0 ? (
        <li className="flex min-h-12 items-center gap-3 bg-warn-soft/60 px-3 py-2 text-sm text-warn-strong">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-warn-soft">
            <UserRoundX aria-hidden className="size-4" strokeWidth={2.25} />
          </span>
          <span className="num">{fmtNumber(i.unnamedCount)} học sinh chưa rõ tên (vẫn được tính điểm)</span>
        </li>
      ) : null}
    </ul>
  );
}

export function IncidentMeta({ incident: i, editHint }: { incident: Incident; editHint?: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs leading-5 text-slate-500">
      <p>
        Ghi nhận bởi <span className="font-medium text-slate-700">{i.createdByName || "Không rõ"}</span> lúc {fmtDateTime(i.createdAt)}
        {i.source === "import" ? ` · Nhập từ Excel${i.externalId ? ` (mã gốc ${i.externalId})` : ""}` : ""}
      </p>
      {i.updatedAt ? <p>Cập nhật lần cuối lúc {fmtDateTime(i.updatedAt)}</p> : null}
      {editHint ? <p className="font-medium text-brand-700">{editHint}</p> : null}
    </div>
  );
}
