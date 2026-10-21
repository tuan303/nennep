"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ClipboardCheck, History, Pencil, Sun, Sunset, Trash, UserRound } from "lucide-react";
import { useNow } from "@/components/app/widgets";
import { Badge, Card, EmptyState, IconButton, cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import { formatDayMonthVN, weekdayLabelVN } from "@/lib/engine/dates";
import type { Inspection, LevelDataset } from "@/lib/types";
import { RECENT_INSPECTION_DAYS, canEditInspection, inspectionDayStats, inspectionScopeLabel, recentInspections } from "./lib/inspection-form";

export interface InspectionListProps {
  ds: Pick<LevelDataset, "inspections">;
  today: string;
  /** Round to highlight (just created / being edited). */
  highlightId?: string;
  onEdit: (r: Inspection) => void;
  onDelete: (r: Inspection) => void;
  className?: string;
}

/** "Đợt kiểm tra gần đây" (30 days, from the dataset): code, date, buổi, Mảng, classes (expandable), inspector, Sửa / Xóa. */
export function InspectionList({ ds, today, highlightId, onEdit, onDelete, className }: InspectionListProps) {
  const { profile } = useSession();
  const now = useNow();
  const rows = useMemo(() => recentInspections(ds.inspections, today), [ds.inspections, today]);
  const day = useMemo(() => inspectionDayStats(ds.inspections, today), [ds.inspections, today]);

  return (
    <Card
      padding="none"
      headingLevel={2}
      icon={History}
      title="Đợt kiểm tra gần đây"
      subtitle={`${RECENT_INSPECTION_DAYS} ngày gần nhất · người ghi sửa/xóa được trong 24 giờ.`}
      className={className}
      actions={
        <Badge tone={day.rounds > 0 ? "brand" : "muted"} size="md" className="num">
          Hôm nay: {fmtNumber(day.rounds)} đợt · {fmtNumber(day.classes)} lớp
        </Badge>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          icon={ClipboardCheck}
          title="Chưa có đợt kiểm tra nào trong 30 ngày qua"
          description="Mỗi lần kiểm tra nền nếp, ghi lại các lớp đã được kiểm tra để bảo đảm so sánh công bằng."
        />
      ) : (
        <ul role="list" className="divide-y divide-border border-t border-border">
          {rows.map((r) => (
            <InspectionRow
              key={r.id}
              inspection={r}
              highlighted={r.id === highlightId}
              canEdit={canEditInspection(profile, r, now)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

interface InspectionRowProps {
  inspection: Inspection;
  highlighted: boolean;
  canEdit: boolean;
  onEdit: (r: Inspection) => void;
  onDelete: (r: Inspection) => void;
}

export function InspectionRow({ inspection: r, highlighted, canEdit, onEdit, onDelete }: InspectionRowProps) {
  const [open, setOpen] = useState(false);
  const ShiftIcon = r.shift === "Chiều" ? Sunset : Sun;
  const listId = `ins-${r.id}`;
  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3 transition-colors sm:px-5", highlighted && "bg-star-50/70")}>
      <div className="flex items-start gap-3">
        <span className="num flex w-12 shrink-0 flex-col items-start pt-0.5">
          <span className="text-sm font-semibold text-slate-800">{formatDayMonthVN(r.date)}</span>
          <span className="text-2xs text-slate-500">{weekdayLabelVN(r.date)}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium leading-5 text-slate-900">{inspectionScopeLabel(r)}</span>
            {r.shift ? (
              <Badge tone="muted" size="sm" icon={ShiftIcon}>
                {r.shift}
              </Badge>
            ) : null}
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="num font-semibold text-slate-600">{r.code}</span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <UserRound aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
              <span className="truncate">{r.inspector || r.createdByName}</span>
            </span>
          </p>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-9 items-center gap-1 self-start rounded-control px-1 text-[13px] font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            {fmtNumber(r.classCodes.length)} lớp
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} strokeWidth={2.25} />
          </button>
          {open ? (
            <ul id={listId} aria-label={`Lớp được kiểm tra trong ${r.code}`} className="flex flex-wrap gap-1.5">
              {r.classCodes.map((c) => (
                <li key={c}>
                  <Badge tone="brand" variant="outline" size="sm" className="num">
                    {c}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton icon={Pencil} label={`Sửa đợt kiểm tra ${r.code}`} size="sm" onClick={() => onEdit(r)} />
            <IconButton icon={Trash} label={`Xóa đợt kiểm tra ${r.code}`} size="sm" className="text-bad-strong hover:bg-bad-soft" onClick={() => onDelete(r)} />
          </div>
        ) : null}
      </div>
    </li>
  );
}
