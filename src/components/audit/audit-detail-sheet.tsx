"use client";
/** Full audit entry: who / when / what, before → after table for updates, and the raw detail as a JSON tree. */
import type { ReactNode } from "react";
import { ArrowRight, Copy, ScrollText } from "lucide-react";
import { Badge, Button, Sheet, cn } from "@/components/ui";
import { copyWithFallback, useRetained } from "@/components/app/widgets";
import { fmtDateTime, fmtRelative } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import type { AuditLog } from "@/lib/types";
import { AuditActionBadge, RoleBadge } from "./audit-badges";
import { JsonViewer } from "./json-viewer";
import { auditActionLabel, entityLabel } from "./lib/audit-labels";
import { diffRowsOf, summarizeAudit, type DiffRow } from "./lib/audit-summary";

function Row({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 border-b border-border py-2", wide && "min-[420px]:col-span-2")}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="num min-w-0 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
      {children}
    </section>
  );
}

function DiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-border">
      <div className="hidden grid-cols-[minmax(8rem,0.8fr)_1fr_1fr] bg-surface-2 text-[12.5px] font-semibold text-slate-500 sm:grid">
        <span className="px-3 py-2">Trường</span>
        <span className="px-3 py-2">Trước</span>
        <span className="px-3 py-2">Sau</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.field} className="grid gap-1.5 px-3 py-2.5 text-sm sm:grid-cols-[minmax(8rem,0.8fr)_1fr_1fr] sm:gap-0 sm:px-0 sm:py-0">
            <span className="font-medium text-slate-800 sm:px-3 sm:py-2.5" title={r.field}>
              {r.label}
            </span>
            <span className="flex items-start gap-2 sm:contents">
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded-md bg-bad-soft/60 px-2 py-1 text-bad-strong sm:m-1.5">
                {r.before}
              </span>
              <ArrowRight aria-label="thành" className="mt-1.5 size-4 shrink-0 text-slate-400 sm:hidden" />
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded-md bg-ok-soft px-2 py-1 text-ok-strong sm:m-1.5">{r.after}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Body of the detail sheet (badges, summary, metadata, diff, JSON). */
export function AuditDetailBody({ log }: { log: AuditLog }) {
  const diff = diffRowsOf(log.detail);
  const summary = summarizeAudit(log);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <AuditActionBadge action={log.action} size="md" />
        <RoleBadge role={log.role} size="md" />
        {log.levelId ? (
          <Badge tone="brand" variant="outline">
            {LEVELS[log.levelId].name}
          </Badge>
        ) : null}
      </div>

      {summary ? <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 ring-1 ring-inset ring-border">{summary}</p> : null}

      <dl className="grid grid-cols-1 gap-x-6 rounded-card border border-border bg-surface px-3.5 pt-1 min-[420px]:grid-cols-2 sm:px-4 [&>div:last-child]:border-b-0 min-[420px]:[&>div:nth-last-child(2)]:border-b-0">
        <Row label="Thời gian">
          {fmtDateTime(log.ts)} <span className="text-slate-500">({fmtRelative(log.ts)})</span>
        </Row>
        <Row label="Người dùng">{log.email || "Không rõ"}</Row>
        <Row label="Đối tượng">{log.entity ? entityLabel(log.entity) : "–"}</Row>
        <Row label="Mã đối tượng">
          <span className="font-mono text-[13px]">{log.entityId || "–"}</span>
        </Row>
        <Row label="Địa chỉ IP">{log.ip || "–"}</Row>
        <Row label="Mã hành động">
          <span className="font-mono text-[13px]">{log.action}</span>
        </Row>
        <Row label="UID">
          <span className="font-mono text-[13px]">{log.uid || "–"}</span>
        </Row>
        <Row label="Mã nhật ký">
          <span className="font-mono text-[13px]">{log.id}</span>
        </Row>
      </dl>

      {diff ? (
        <Section title={`Thay đổi (${diff.length})`}>
          <DiffTable rows={diff} />
        </Section>
      ) : null}

      <Section title="Chi tiết (JSON)">
        {log.detail && Object.keys(log.detail).length > 0 ? <JsonViewer value={log.detail} /> : <p className="text-sm text-slate-500">Không có chi tiết.</p>}
      </Section>
    </div>
  );
}

export function AuditDetailSheet({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
  const shown = useRetained(log);
  if (!shown) return null;
  const current = shown;

  async function copyJson() {
    await copyWithFallback(JSON.stringify(current, null, 2), { success: "Đã sao chép bản ghi nhật ký (JSON)", title: "Sao chép bản ghi nhật ký (JSON)" });
  }

  return (
    <Sheet
      open={log != null}
      onOpenChange={(open) => !open && onClose()}
      title={auditActionLabel(current.action)}
      description={`${fmtDateTime(current.ts)} · ${current.email || "Không rõ người dùng"}`}
      icon={ScrollText}
      size="lg"
      footer={
        <Button variant="secondary" icon={Copy} onClick={() => void copyJson()}>
          Sao chép JSON
        </Button>
      }
    >
      <AuditDetailBody log={current} />
    </Sheet>
  );
}
