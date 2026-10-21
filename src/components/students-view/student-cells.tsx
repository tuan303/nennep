"use client";
/** Cells and the phone card of the Học sinh table. */
import { Info } from "lucide-react";
import { Avatar, Badge, Tooltip } from "@/components/ui";
import { StudentAlertBadge, StudentStatusBadge } from "@/components/app/widgets";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { StudentStat } from "@/lib/engine";
import type { CatalogItem, LevelConfig } from "@/lib/types";
import { errorChips } from "./lib/students-model";

export const POINTS_HINT = "Chỉ tính các lỗi tính theo học sinh (/HS). Điểm lỗi tính theo lần (/lần) không tính cho cá nhân.";

export function PointsHeader() {
  return (
    <Tooltip content={POINTS_HINT}>
      <span className="inline-flex items-center gap-1">
        Điểm
        <Info aria-hidden className="size-3.5 opacity-70" strokeWidth={2.25} />
      </span>
    </Tooltip>
  );
}

export function NameCell({ s }: { s: StudentStat }) {
  return (
    <span className="flex min-w-44 items-center gap-2.5">
      <Avatar name={s.name} size="sm" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold text-slate-900">{s.name}</span>
        {s.status !== "ACTIVE" ? <StudentStatusBadge status={s.status} size="sm" /> : null}
      </span>
    </span>
  );
}

export function ErrorChips({ s, catalog }: { s: StudentStat; catalog: readonly Pick<CatalogItem, "code" | "displayName">[] }) {
  const { chips, more } = errorChips(s.errors, catalog);
  return (
    <span className="flex max-w-sm flex-wrap gap-1">
      {chips.map((c) => (
        <Badge key={c.errorCode} tone="muted" size="sm" title={`${c.errorCode} – ${c.issue}: ${c.count} lượt`}>
          {c.label} ×{c.count}
        </Badge>
      ))}
      {more > 0 ? (
        <Badge tone="brand" variant="outline" size="sm" title={s.errors.slice(3).map((e) => `${e.issue} ×${e.count}`).join(" · ")}>
          +{more}
        </Badge>
      ) : null}
    </span>
  );
}

/** Desktop table cell (a table row may hold the focusable tooltip badge). */
export function AlertCell({ s, config }: { s: StudentStat; config?: Pick<LevelConfig, "studentAlert"> }) {
  return s.alert === "NONE" ? <span className="text-slate-400">–</span> : <StudentAlertBadge alert={s.alert} config={config} size="sm" />;
}

/** Phone layout (inside the row button: phrasing content only). */
export function StudentCard({ s, catalog }: { s: StudentStat; catalog: readonly Pick<CatalogItem, "code" | "displayName">[] }) {
  return (
    <span className="flex items-start gap-3">
      <Avatar name={s.name} size="md" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-slate-900">{s.name}</span>
            <span className="num text-xs text-slate-500">
              Lớp {s.classCode} · {s.id}
            </span>
          </span>
          <span className="num flex shrink-0 flex-col items-end">
            <span className="text-base font-bold text-brand-900">{fmtNumber(s.incidents)} lượt</span>
            <span className="text-xs text-slate-500">{fmtNumber(s.points)} điểm</span>
          </span>
        </span>
        <ErrorChips s={s} catalog={catalog} />
        <span className="flex flex-wrap items-center justify-between gap-2">
          {s.alert !== "NONE" ? <StudentAlertBadge alert={s.alert} size="sm" /> : s.status !== "ACTIVE" ? <StudentStatusBadge status={s.status} size="sm" /> : <span />}
          <span className="num text-xs text-slate-500">Gần nhất {fmtDate(s.lastDate)}</span>
        </span>
      </span>
    </span>
  );
}
