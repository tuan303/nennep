"use client";
import { useId, useMemo } from "react";
import { FilterX, Info, School, TriangleAlert } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { ClassPicker, PeriodBadge } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import { classStats } from "@/lib/engine";
import type { LevelDataset, Period } from "@/lib/types";

export interface ReportClassBarProps {
  ds: LevelDataset;
  period: Period;
  classCode?: string;
  isGvcn: boolean;
  ownClasses: readonly string[];
  /** Class filter not allowed for this GVCN (shown as a note). */
  ignoredFilterClass?: string;
  /** Active Mảng / Lỗi filters, which a class report does not apply (labels, see `ignoredReportFilters`). */
  ignoredFilters?: readonly string[];
  /** Clears the Mảng / Lỗi filters. */
  onClearIgnoredFilters?: () => void;
  onChange: (classCode: string) => void;
}

/** Class + period bar above the report (hidden when printing). GVCN: own classes only. */
export function ReportClassBar({
  ds,
  period,
  classCode,
  isGvcn,
  ownClasses,
  ignoredFilterClass,
  ignoredFilters = [],
  onClearIgnoredFilters,
  onChange,
}: ReportClassBarProps) {
  const pickerId = useId();
  const fixed = isGvcn && ownClasses.length <= 1;
  return (
    <Card padding="sm" data-print-hide>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        {fixed ? (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-9 items-center justify-center rounded-control bg-brand-50 text-brand-600">
              <School aria-hidden className="size-[18px]" strokeWidth={2.25} />
            </span>
            <span className="text-[13px] text-slate-600">Lớp chủ nhiệm</span>
            <span className="num text-lg font-bold text-brand-900">{classCode ?? "–"}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
            <label htmlFor={pickerId} className="text-[13px] font-medium text-slate-600">
              {isGvcn ? "Lớp chủ nhiệm" : "Lớp"}
            </label>
            <ClassPicker
              id={pickerId}
              ds={ds}
              value={classCode}
              onChange={onChange}
              restrictTo={isGvcn ? ownClasses : undefined}
              placeholder="Chọn lớp để lập báo cáo"
              className="md:w-80"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <span className="text-[13px] text-slate-500">Kỳ báo cáo</span>
          <PeriodBadge period={period} semesters={ds.config.semesters} />
        </div>
      </div>
      {ignoredFilterClass ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-5 text-warn-strong">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.25} />
          Lớp {ignoredFilterClass} trong bộ lọc không thuộc lớp chủ nhiệm của thầy/cô – đang hiển thị báo cáo lớp {classCode}.
        </p>
      ) : null}
      {ignoredFilters.length > 0 ? (
        <div role="note" className="mt-2.5 flex flex-col gap-2 text-xs leading-5 text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-500" strokeWidth={2.25} />
            <span>
              Bộ lọc Mảng / Lỗi không áp dụng cho Báo GVCN – báo cáo luôn gồm mọi lỗi của lớp trong kỳ (đang chọn: {ignoredFilters.join("; ")}).
            </span>
          </p>
          {onClearIgnoredFilters ? (
            <Button variant="ghost" size="sm" icon={FilterX} onClick={onClearIgnoredFilters} className="shrink-0 self-start sm:self-auto">
              Bỏ lọc Mảng / Lỗi
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export interface ClassChooserProps {
  ds: LevelDataset;
  period: Period;
  grade?: number;
  onPick: (classCode: string) => void;
}

/** Shown before a class is chosen: a picker plus quick tiles of the classes with most penalty points. */
export function ClassChooser({ ds, period, grade, onPick }: ClassChooserProps) {
  const pickerId = useId();
  const pMode = period.mode;
  const pKey = period.key;
  const top = useMemo(
    () => classStats(ds, { period: { mode: pMode, key: pKey }, grade }).filter((c) => c.incidents > 0).slice(0, 8),
    [ds, pMode, pKey, grade],
  );

  return (
    <Card padding="none">
      <EmptyState
        icon={School}
        title="Chọn lớp để lập báo cáo"
        description="Báo cáo gồm sự việc, điểm thưởng, điểm thi đua và xếp hạng của lớp trong kỳ đang chọn – có thể sao chép gửi Zalo, in hoặc lưu PDF."
        action={
          <div className="w-[min(20rem,calc(100vw-5rem))]">
            <label htmlFor={pickerId} className="sr-only">
              Chọn lớp
            </label>
            <ClassPicker id={pickerId} ds={ds} grade={grade} onChange={onPick} size="lg" />
          </div>
        }
      />
      {top.length > 0 ? (
        <div className="border-t border-border p-4 sm:p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-slate-600">Lớp có nhiều điểm trừ trong kỳ</h3>
          <ul role="list" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {top.map((c) => (
              <li key={c.classCode}>
                <button
                  type="button"
                  onClick={() => onPick(c.classCode)}
                  className="flex min-h-11 w-full flex-col gap-0.5 rounded-control border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span className="num font-bold text-brand-900">{c.classCode}</span>
                  <span className="truncate text-xs text-slate-500">{c.homeroomTeacher ?? "Chưa có GVCN"}</span>
                  <span className="num mt-1 text-xs text-slate-600">
                    {fmtNumber(c.incidents)} sự việc · <strong className="text-bad-strong">{fmtNumber(c.points)} điểm</strong>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
