"use client";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { FormulaText } from "@/components/app/widgets";
import { cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { Scope } from "@/lib/types";
import type { EntryPreview } from "./lib/preview";

export interface PointsPreviewProps {
  preview: EntryPreview;
  scope: Scope;
  classCode: string;
  /** The user already tried to save (issues are shown more prominently). */
  attempted?: boolean;
  /** Points currently stored on the record being edited (shows the change). */
  storedPoints?: number;
}

/** Step 5 – live points (engine computePoints) with the formula and the friendly list of what still blocks saving. */
export function PointsPreview({ preview, scope, classCode, attempted, storedPoints }: PointsPreviewProps) {
  const { item, points, formula, issues, canSave, flagsUnnamed, relatedCount } = preview;
  const changed = storedPoints !== undefined && item && storedPoints !== points;
  return (
    <div className="overflow-hidden rounded-card border border-brand-100 bg-gradient-to-br from-brand-50 via-surface to-surface shadow-xs">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 p-4">
        <div className="min-w-0">
          <p className="text-2xs font-bold uppercase tracking-[0.08em] text-brand-600">Điểm trừ dự kiến</p>
          <p className="num mt-1 flex items-baseline gap-2" aria-live="polite" aria-atomic="true">
            <span className={cn("text-[44px] font-extrabold leading-none tracking-tight", item ? "text-brand-900" : "text-slate-300")}>
              {item ? fmtNumber(points) : "–"}
            </span>
            <span className="text-sm font-semibold text-slate-500">điểm trừ</span>
          </p>
          {changed ? (
            <p className="num mt-1 text-xs text-slate-500">
              Đang lưu: {fmtNumber(storedPoints)} điểm → sau khi cập nhật: <strong className="text-brand-900">{fmtNumber(points)} điểm</strong>
            </p>
          ) : null}
        </div>
        {formula ? (
          <FormulaText input={formula} total={points} icon className="text-sm" />
        ) : (
          <p className="max-w-56 text-[13px] leading-5 text-slate-500">Chọn lỗi vi phạm để xem cách tính điểm.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-brand-100 bg-surface/80 px-4 py-3">
        {canSave ? (
          <p className="flex items-start gap-2 text-[13px] font-medium leading-5 text-ok-strong">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            <span>
              Sẵn sàng lưu · Lớp {classCode} · {scope}
              {relatedCount > 0 ? ` · ${fmtNumber(relatedCount)} HS liên quan` : ""}
            </span>
          </p>
        ) : (
          <div role={attempted ? "alert" : undefined}>
            <p className={cn("flex items-center gap-2 text-[13px] font-semibold", attempted ? "text-bad-strong" : "text-warn-strong")}>
              <TriangleAlert aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
              Cần hoàn tất trước khi lưu
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 pl-6">
              {issues.map((m) => (
                <li key={m} className="flex items-start gap-1.5 text-[13px] leading-5 text-slate-700">
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" strokeWidth={2.5} />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {flagsUnnamed ? (
          <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-2.5 py-2 text-xs leading-5 text-warn-strong">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
            Có học sinh chưa rõ tên: bản ghi sẽ được đánh dấu “Thiếu tên HS” để rà soát (điểm vẫn được tính).
          </p>
        ) : null}
      </div>
    </div>
  );
}
