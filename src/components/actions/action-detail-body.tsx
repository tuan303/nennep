"use client";
/** Read-only blocks of the action detail sheet. */
import type { ReactNode } from "react";
import { ExternalLink, Siren } from "lucide-react";
import { PriorityBadge, StatusBadge, cn } from "@/components/ui";
import { safeExternalUrl } from "@/components/app/widgets";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { PRIORITY_LABELS } from "@/lib/constants";
import { diffDays, formatDateVN, weekdayLabelVN } from "@/lib/engine";
import type { ActionItem, Priority } from "@/lib/types";
import { DeadlineBadge, OwnerChip, ScopeClassPill } from "./action-bits";
import { isOverdue } from "./lib/action-view";

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

export function ActionSummary({ item, today }: { item: ActionItem; today: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-gradient-to-b from-surface to-surface-2 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="num text-2xs font-bold uppercase tracking-wider text-slate-400">{item.code}</p>
        <p className="text-[15px] font-semibold leading-6 text-brand-900">{item.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.status} size="sm" />
        <PriorityBadge priority={item.priority} size="sm" />
        <DeadlineBadge item={item} today={today} />
        <ScopeClassPill code={item.scopeClass} />
      </div>
    </div>
  );
}

/** Red strip for overdue actions; "Cần leo thang" once overdue longer than the SLA of the priority. */
export function OverdueNotice({ item, today, sla }: { item: ActionItem; today: string; sla: Record<Priority, number> }) {
  if (!isOverdue(item, today)) return null;
  const days = diffDays(today, item.deadline);
  const escalate = days > sla[item.priority];
  return (
    <div role="status" className={cn("flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[13px] leading-5 ring-1 ring-inset", escalate ? "bg-bad-soft text-bad-strong ring-bad/20" : "bg-warn-soft text-warn-strong ring-warn/25")}>
      <Siren aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
      <p>
        <span className="font-semibold">{escalate ? "Cần leo thang" : "Đã quá hạn"}</span> – quá hạn {days} ngày (SLA mức {PRIORITY_LABELS[item.priority].toLowerCase()}:{" "}
        {sla[item.priority]} ngày).{" "}
        {escalate ? "Đề nghị báo cáo BGH và thống nhất lại hạn hoặc người phụ trách." : "Vui lòng cập nhật tiến độ hoặc điều chỉnh hạn xử lý."}
      </p>
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

export function ActionInfo({ item }: { item: ActionItem }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 rounded-card border border-border bg-surface px-3.5 py-1 min-[420px]:grid-cols-2 sm:gap-x-6 sm:px-4">
      <Row label="Người phụ trách">
        <OwnerChip owner={item.owner} />
      </Row>
      <Row label="Hạn xử lý">
        {weekdayLabelVN(item.deadline)}, {formatDateVN(item.deadline)}
      </Row>
      <Row label="Lớp liên quan">{item.scopeClass ? `Lớp ${item.scopeClass}` : "Toàn cấp học"}</Row>
      <Row label="Tuần phát sinh">{item.sourceWeek ? `Tuần bắt đầu ${formatDateVN(item.sourceWeek)}` : "Không gắn tuần"}</Row>
      <Row label="Người tạo">
        {item.createdByName} · {fmtDate(item.createdAt)}
      </Row>
      <Row label={item.status === "Done" ? "Hoàn thành lúc" : "Cập nhật gần nhất"}>
        {item.status === "Done" && item.closedAt ? fmtDateTime(item.closedAt) : item.updatedAt ? fmtDateTime(item.updatedAt) : "Chưa cập nhật"}
      </Row>
    </dl>
  );
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Plain text with http(s) links made clickable (other schemes stay text). */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800", className)}>
      {parts.map((p, i) => {
        const href = i % 2 === 1 ? safeExternalUrl(p) : undefined;
        return href ? (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
            {p}
            <ExternalLink aria-hidden className="size-3" />
          </a>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </p>
  );
}
