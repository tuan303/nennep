"use client";
/** Small presentational pieces shared by the student-admin dialogs and sheets. */
import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { StudentStatusBadge } from "@/components/app/widgets";
import { Avatar, cn, toneSoft, type Tone } from "@/components/ui";
import { fmtDate } from "@/lib/client/format";
import type { StudentLite } from "@/lib/types";

const CALLOUT_ICON: Partial<Record<Tone, LucideIcon>> = { warn: TriangleAlert, bad: CircleAlert };

/** Tinted note inside forms ("Lịch sử vi phạm ở lớp cũ được giữ nguyên"). Text + icon, never colour alone. */
export function Callout({ tone = "brand", icon, title, children, className }: { tone?: Tone; icon?: LucideIcon; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = icon ?? CALLOUT_ICON[tone] ?? Info;
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cn("flex items-start gap-2.5 rounded-control px-3.5 py-3 text-[13px] leading-5 ring-1 ring-inset", toneSoft[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5 opacity-90" : undefined)}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Avatar + name + "Mã HS · Lớp · Ngày sinh" – the student a dialog acts on. */
export function StudentIdentity({ student, className, extra }: { student: StudentLite; className?: string; extra?: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-inset ring-border", className)}>
      <Avatar name={student.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-semibold text-brand-900">{student.name}</p>
          {student.status !== "ACTIVE" ? <StudentStatusBadge status={student.status} size="sm" /> : null}
        </div>
        <p className="num truncate text-xs text-slate-500">
          Mã HS {student.id} · Lớp {student.classCode}
          {student.dob ? ` · ${fmtDate(student.dob)}` : ""}
        </p>
      </div>
      {extra}
    </div>
  );
}

/** Visible label for a control group without a single input (SegmentedControl), announced via role="group". */
export function ChoiceGroup({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span aria-hidden className="text-[13.5px] font-semibold leading-5 text-slate-800">
        {label}
      </span>
      {children}
      {hint ? <p className="text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export interface MetaItem {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Spans both columns (long text such as notes). */
  wide?: boolean;
}

/** Label/value list: one column on phones by default, two from 640px (pass "grid-cols-2" to keep two columns everywhere). */
export function MetaList({ items, className }: { items: Array<MetaItem | null | false>; className?: string }) {
  const shown = items.filter((x): x is MetaItem => !!x);
  return (
    <dl className={cn("grid gap-x-4 gap-y-3 sm:grid-cols-2", className)}>
      {shown.map(({ label, value, icon: Icon, wide }) => (
        <div key={label} className={cn("flex min-w-0 items-start gap-2", wide && "col-span-full")}>
          {Icon ? <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-400" strokeWidth={2.25} /> : null}
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="num break-words text-sm font-medium text-slate-800">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
