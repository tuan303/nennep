"use client";
/** "Cảnh báo sớm" (REQ_V2 §6.2): counts per kind + the 5 most urgent engine warnings of the filtered scope. */
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Hourglass, Repeat, ShieldCheck, Siren, TrendingUp, type LucideIcon } from "lucide-react";
import { Badge, Card, buttonClasses, cn } from "@/components/ui";
import { ScopeBadge } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import { EARLY_WARNING_KIND_LABELS, earlyWarnings, type EarlyWarning, type EarlyWarningKind } from "@/lib/engine";
import type { GlobalFilters, Incident, LevelDataset, UserProfile } from "@/lib/types";
import { SEVERITY_LABEL, SEVERITY_TONE, scopeWarningsForViewer, warningKindBadges, warningsHref } from "../lib/warning-model";
import { RowButton } from "../shared/parts";

export const WARNING_ICONS: Record<EarlyWarningKind, LucideIcon> = {
  SERIOUS_INCIDENT: Siren,
  REPEAT_STUDENT: Repeat,
  RISING_CLASS: TrendingUp,
  PROLONGED_ERROR: Hourglass,
};

export interface EarlyWarningCardProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  profile?: Pick<UserProfile, "role" | "gvcnClasses">;
  /** Show "Xem tất cả" (→ Hành động, tab Cảnh báo sớm). */
  canOpenActions: boolean;
  /** Current query string (kept in the "Xem tất cả" link). */
  search: string;
  onOpenClass: (classCode: string) => void;
  onOpenStudent: (studentId: string) => void;
  onOpenIncident: (incident: Incident) => void;
  className?: string;
}

const LIMIT = 5;

export function EarlyWarningCard({
  ds,
  filters,
  today,
  profile,
  canOpenActions,
  search,
  onOpenClass,
  onOpenStudent,
  onOpenIncident,
  className,
}: EarlyWarningCardProps) {
  const items = useMemo(() => scopeWarningsForViewer(earlyWarnings(ds, filters, today), profile, ds.levelId), [ds, filters, today, profile]);
  const badges = useMemo(() => warningKindBadges(items), [items]);
  const byId = useMemo(() => new Map(ds.incidents.map((i) => [i.id, i] as const)), [ds.incidents]);
  const top = items.slice(0, LIMIT);

  const open = (w: EarlyWarning) => {
    const incident = w.kind === "SERIOUS_INCIDENT" ? byId.get(w.evidence.incidentIds[0] ?? "") : undefined;
    if (incident) onOpenIncident(incident);
    else if (w.kind === "REPEAT_STUDENT" && w.studentId) onOpenStudent(w.studentId);
    else onOpenClass(w.classCode);
  };

  return (
    <Card
      className={className}
      icon={BellRing}
      title="Cảnh báo sớm"
      subtitle={profile?.role === "GVCN" ? "Các lớp thầy/cô chủ nhiệm · kỳ đang xem" : "Tái phạm, tăng lỗi, lỗi kéo dài, sự việc nghiêm trọng"}
      actions={
        canOpenActions && items.length > 0 ? (
          <Link href={warningsHref(search)} className={buttonClasses({ variant: "ghost", size: "sm" })} data-print-hide>
            Xem tất cả
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <ul aria-label="Số cảnh báo theo loại" className="flex flex-wrap gap-1.5">
          {badges.map((b) => {
            const Icon = WARNING_ICONS[b.kind];
            return (
              <li key={b.kind}>
                <Badge tone={b.count > 0 ? b.tone : "muted"} size="md" icon={Icon} className={cn(b.count === 0 && "opacity-70")}>
                  {b.label}: <span className="num font-bold">{fmtNumber(b.count)}</span>
                </Badge>
              </li>
            );
          })}
        </ul>

        {top.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-[13px] font-medium text-ok-strong ring-1 ring-inset ring-ok/20">
            <ShieldCheck aria-hidden className="size-4 shrink-0" />
            Chưa có cảnh báo trong kỳ này
          </p>
        ) : (
          <ol className="-mx-2.5 flex flex-col gap-0.5">
            {top.map((w) => {
              const Icon = WARNING_ICONS[w.kind];
              const incident = w.kind === "SERIOUS_INCIDENT" ? byId.get(w.evidence.incidentIds[0] ?? "") : undefined;
              const tone = SEVERITY_TONE[w.severity];
              return (
                <li key={w.id}>
                  <RowButton onClick={() => open(w)} label={`${EARLY_WARNING_KIND_LABELS[w.kind]}, ${SEVERITY_LABEL[w.severity].toLowerCase()}: ${w.message}`}>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={tone} size="sm" icon={Icon}>
                          {EARLY_WARNING_KIND_LABELS[w.kind]}
                        </Badge>
                        {incident ? <ScopeBadge scope={incident.scope} size="sm" /> : null}
                        <span className="num text-xs font-semibold text-slate-500">Lớp {w.classCode}</span>
                        {/* Severity as text too (the badge colour alone must not carry it). */}
                        <span className="text-xs text-slate-500">· {SEVERITY_LABEL[w.severity]}</span>
                      </span>
                      <span className="line-clamp-2 text-[13px] leading-5 text-slate-700">{w.message}</span>
                    </span>
                  </RowButton>
                </li>
              );
            })}
          </ol>
        )}
        {items.length > LIMIT ? (
          <p className="num text-xs text-slate-500">
            Còn {fmtNumber(items.length - LIMIT)} cảnh báo khác{canOpenActions ? " – xem đầy đủ ở Hành động." : "."}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
