"use client";
/** "Cảnh báo sớm" tab of Hành động (REQ_V2 §7.6): the engine's unified early warnings, grouped by severity. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { BellRing, CalendarRange, FileWarning, FilterX, History, Hourglass, Info, Link2, ListPlus, Repeat, School, Siren, TrendingUp, type LucideIcon } from "lucide-react";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { Badge, Button, Card, EmptyState, Pill, StatusBadge, cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { EARLY_WARNING_KIND_LABELS, earlyWarningCounts, formatDayMonthVN, type EarlyWarning, type EarlyWarningKind } from "@/lib/engine";
import type { ActionItem, Incident, LevelDataset, Period } from "@/lib/types";
import { SeverityBadge } from "./action-bits";
import { findExistingAction } from "./lib/action-view";
import { WARNING_KINDS, WARNING_KIND_HINTS, filterWarningsByKind, groupWarningsBySeverity, warningIncidents } from "./lib/early-warning-view";
import { PeriodControl } from "./period-control";

export const WARNING_KIND_ICONS: Record<EarlyWarningKind, LucideIcon> = {
  SERIOUS_INCIDENT: Siren,
  REPEAT_STUDENT: Repeat,
  RISING_CLASS: TrendingUp,
  PROLONGED_ERROR: Hourglass,
};

const KIND_TONE = { SERIOUS_INCIDENT: "bad", REPEAT_STUDENT: "warn", RISING_CLASS: "warn", PROLONGED_ERROR: "brand" } as const;
const SEVERITY_BORDER = { high: "border-l-bad", medium: "border-l-warn", low: "border-l-slate-300" } as const;
const EVIDENCE_SHOWN = 3;

/** Kind of a warning: icon + text (never colour alone). */
export function WarningKindBadge({ kind, size = "sm" }: { kind: EarlyWarningKind; size?: "sm" | "md" }) {
  return (
    <Badge tone={KIND_TONE[kind]} size={size} icon={WARNING_KIND_ICONS[kind]}>
      {EARLY_WARNING_KIND_LABELS[kind]}
    </Badge>
  );
}

export interface EarlyWarningTabProps {
  ds: LevelDataset;
  /** earlyWarnings(ds, filters, today) – computed by the screen (also feeds the tab count). */
  warnings: EarlyWarning[];
  /** Non-period filters narrowing the list (see warningScopeLabels) and how to clear them. */
  scopeLabels?: readonly string[];
  onClearScope?: () => void;
  period: Period;
  periodText: string;
  actions?: readonly ActionItem[];
  canManage: boolean;
  onCreate: (w: EarlyWarning) => void;
  onOpenAction: (item: ActionItem) => void;
}

export function EarlyWarningTab({ ds, warnings, scopeLabels = [], onClearScope, period, periodText, actions, canManage, onCreate, onOpenAction }: EarlyWarningTabProps) {
  const [kind, setKind] = useState<EarlyWarningKind | undefined>();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const counts = useMemo(() => earlyWarningCounts(warnings), [warnings]);
  const activeKind = kind && counts[kind] > 0 ? kind : undefined;
  const groups = useMemo(() => groupWarningsBySeverity(filterWarningsByKind(warnings, activeKind)), [warnings, activeKind]);

  return (
    <div className="flex flex-col gap-4">
      <PeriodControl />

      <Card
        padding="none"
        icon={BellRing}
        title="Cảnh báo sớm"
        subtitle={`${periodText} · tái phạm, tăng lỗi, lỗi kéo dài và sự việc nghiêm trọng (ngưỡng trong Cài đặt → Cảnh báo sớm).`}
        actions={
          <Badge tone={warnings.length > 0 ? "bad" : "ok"} size="md" className="num">
            {fmtNumber(warnings.length)} cảnh báo
          </Badge>
        }
      >
        {scopeLabels.length > 0 ? (
          <div role="note" className="mx-4 mb-3 flex flex-col gap-2 rounded-control bg-brand-50/70 px-3 py-2 text-xs leading-5 text-brand-900 ring-1 ring-inset ring-brand-100 sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-1.5">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.25} />
              <span>Đang lọc theo: {scopeLabels.join(" · ")}.</span>
            </p>
            {onClearScope ? (
              <Button variant="ghost" size="sm" icon={FilterX} onClick={onClearScope} className="shrink-0 self-start sm:self-auto">
                Bỏ lọc
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border px-4 pb-3 sm:flex-wrap sm:px-5" role="group" aria-label="Lọc theo loại cảnh báo">
          <Pill active={!activeKind} onClick={() => setKind(undefined)} className="shrink-0">
            Tất cả · {fmtNumber(warnings.length)}
          </Pill>
          {WARNING_KINDS.map((k) => (
            <Pill
              key={k}
              icon={WARNING_KIND_ICONS[k]}
              tone={KIND_TONE[k]}
              active={activeKind === k}
              disabled={counts[k] === 0}
              onClick={() => setKind(activeKind === k ? undefined : k)}
              title={WARNING_KIND_HINTS[k]}
              className="shrink-0"
            >
              {EARLY_WARNING_KIND_LABELS[k]} · {fmtNumber(counts[k])}
            </Pill>
          ))}
        </div>

        {groups.length === 0 ? (
          <EmptyState
            size="sm"
            icon={BellRing}
            tone="ok"
            title="Chưa có cảnh báo trong kỳ này"
            description={period.mode === "week" ? "Không có lớp hay học sinh nào chạm ngưỡng cảnh báo trong tuần." : "Không có lớp hay học sinh nào chạm ngưỡng cảnh báo trong kỳ."}
          />
        ) : (
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            {groups.map((g) => (
              <section key={g.severity} aria-labelledby={`ew-${g.severity}`} className="flex flex-col gap-2.5">
                <h3 id={`ew-${g.severity}`} className="flex items-center gap-2 text-sm font-semibold text-brand-900">
                  <SeverityBadge severity={g.severity} />
                  {g.label}
                  <span className="num font-normal text-slate-500">· {fmtNumber(g.items.length)}</span>
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {g.items.map((w) => (
                    <WarningItem
                      key={w.id}
                      warning={w}
                      incidents={warningIncidents(w, ds.incidents)}
                      existing={actions ? findExistingAction(actions, w.message) : undefined}
                      canManage={canManage}
                      onCreate={onCreate}
                      onOpenAction={onOpenAction}
                      onOpenIncident={setIncident}
                      onOpenStudent={setStudentId}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <IncidentDetailSheet ds={ds} incident={incident} onClose={() => setIncident(null)} onOpenStudent={setStudentId} />
      <StudentHistorySheet
        ds={ds}
        studentId={studentId}
        period={period}
        onClose={() => setStudentId(null)}
        onOpenIncident={(i) => {
          setStudentId(null);
          setIncident(i);
        }}
      />
    </div>
  );
}

export interface WarningItemProps {
  warning: EarlyWarning;
  /** Evidence records found in the dataset. */
  incidents: Incident[];
  existing?: ActionItem;
  canManage: boolean;
  onCreate: (w: EarlyWarning) => void;
  onOpenAction: (item: ActionItem) => void;
  onOpenIncident: (i: Incident) => void;
  onOpenStudent: (studentId: string) => void;
}

export function WarningItem({ warning: w, incidents, existing, canManage, onCreate, onOpenAction, onOpenIncident, onOpenStudent }: WarningItemProps) {
  const more = incidents.length - EVIDENCE_SHOWN;
  return (
    <li className={cn("flex flex-col gap-2.5 rounded-xl border border-l-4 border-border bg-surface p-3.5", SEVERITY_BORDER[w.severity])}>
      <div className="flex flex-wrap items-center gap-1.5">
        <WarningKindBadge kind={w.kind} />
        <Link
          href={`/lop?class=${encodeURIComponent(w.classCode)}`}
          className="inline-flex min-h-8 items-center gap-1 rounded-control px-1.5 text-[13px] font-bold text-brand-800 hover:bg-brand-50 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <School aria-hidden className="size-3.5" strokeWidth={2.25} />
          Lớp {w.classCode}
        </Link>
        {w.week ? (
          <Badge tone="muted" size="sm" icon={CalendarRange}>
            Tuần {formatDayMonthVN(w.week)}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm font-semibold leading-5 text-slate-900">{w.message}</p>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Bằng chứng">
        {w.kind === "REPEAT_STUDENT" && w.studentId ? (
          <Button size="sm" variant="ghost" icon={History} onClick={() => onOpenStudent(w.studentId!)}>
            Lịch sử học sinh
          </Button>
        ) : null}
        {incidents.slice(0, EVIDENCE_SHOWN).map((i) => (
          <Button key={i.id} size="sm" variant="ghost" icon={FileWarning} onClick={() => onOpenIncident(i)} aria-label={`Xem sự việc ${i.code}`}>
            <span className="num">{i.code}</span>
          </Button>
        ))}
        {more > 0 ? <span className="num text-xs text-slate-500">+{fmtNumber(more)} sự việc</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden" data-print-hide>
        {existing ? (
          <button
            type="button"
            onClick={() => onOpenAction(existing)}
            title="Mở hành động đã tạo từ cảnh báo này"
            className="inline-flex min-h-10 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-control px-2.5 py-1.5 text-left text-[13px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <Link2 aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
              Đã có hành động
            </span>
            <span className="num">{existing.code}</span>
            <StatusBadge status={existing.status} size="sm" />
          </button>
        ) : canManage ? (
          <Button variant="outline" size="sm" icon={ListPlus} onClick={() => onCreate(w)}>
            Tạo hành động
          </Button>
        ) : null}
      </div>
    </li>
  );
}
