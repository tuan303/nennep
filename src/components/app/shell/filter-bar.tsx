"use client";
/**
 * Global filter UI. Every component here calls `useFilters()` (useSearchParams), so render it inside <Suspense>.
 * - FilterBar: one wrapping row of controls (desktop ≥ 1024px).
 * - FilterChips: compact context row for phones/tablets (period stepper + removable active filters).
 * - FilterButton: "Bộ lọc" button with the active-filter count, opens the shared FilterSheet.
 */
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button, Pill, Skeleton, cn } from "@/components/ui";
import { useDataset } from "@/lib/client/data";
import { useFilters } from "@/lib/client/filters";
import { CategoryField, ClassField, ErrorField, GradeField, PeriodField, PeriodModeControl } from "./filter-fields";
import { optionsOfMode, periodText, stepPeriodKey } from "./period-utils";
import { useFilterSheet } from "./shell-context";

/**
 * Desktop filter row. Two groups: period (mode + picker) and dimensions (khối, lớp, mảng, lỗi). When the content
 * column is too narrow for one line, the dimension group wraps onto its own full-width row.
 */
export function FilterBar({ className }: { className?: string }) {
  const f = useFilters();
  const { status } = useDataset();
  // Until the level's calendar is known the period would briefly read "Toàn bộ": show the placeholder instead.
  if (status === "loading") return <FilterBarSkeleton className={className} />;
  return (
    <div role="group" aria-label="Bộ lọc báo cáo" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2.5", className)}>
      <div className="flex shrink-0 items-center gap-2">
        <PeriodModeControl f={f} />
        <PeriodField f={f} className="w-[320px]" />
      </div>
      <div className="flex min-w-[600px] flex-1 items-center gap-2">
        <GradeField f={f} className="min-w-0 flex-1" />
        <ClassField f={f} className="min-w-0 flex-1" />
        <CategoryField f={f} className="min-w-0 flex-[1.3]" />
        <ErrorField f={f} className="min-w-0 flex-[1.5]" />
        {f.activeCount > 0 ? (
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={f.resetFilters} className="shrink-0">
            Xóa lọc
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function FilterBarSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-wrap items-center gap-x-3 gap-y-2.5", className)}>
      <Skeleton className="h-10 w-[573px] rounded-control" />
      <Skeleton className="h-10 min-w-[600px] flex-1 rounded-control" />
    </div>
  );
}

/** Phones/tablets: "‹ Tuần 12/10 – 18/10/2026 ›" + removable pills of active filters (horizontal scroll). */
export function FilterChips({ className }: { className?: string }) {
  const f = useFilters();
  const { setOpen } = useFilterSheet();
  const loading = useDataset().status === "loading";
  const { period, grade, classCode, category, errorCode } = f.filters;
  const list = optionsOfMode(f.options, period.mode);
  const prev = stepPeriodKey(list, period.key, -1);
  const next = stepPeriodKey(list, period.key, 1);
  const stepper = period.mode !== "all";
  const errorItem = errorCode ? f.options.errors.find((e) => e.code === errorCode) : undefined;
  if (loading) return <FilterChipsSkeleton className={className} />;
  const arrowClass =
    "inline-flex size-10 shrink-0 items-center justify-center text-brand-700 transition-colors hover:bg-brand-50 disabled:text-slate-300 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500";

  return (
    <div className={cn("no-scrollbar -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6", className)}>
      <div className="flex w-max items-center gap-2 py-0.5">
        <div className="inline-flex h-10 items-stretch overflow-hidden rounded-full bg-surface shadow-xs ring-1 ring-inset ring-border-strong">
          {stepper ? (
            <button type="button" aria-label="Kỳ trước" disabled={!prev} onClick={() => prev && f.setFilters({ period: { mode: period.mode, key: prev } })} className={arrowClass}>
              <ChevronLeft aria-hidden className="size-[18px]" strokeWidth={2.25} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "num inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-900 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500",
              stepper ? "px-1" : "px-3.5",
            )}
          >
            <CalendarDays aria-hidden className="size-4 text-brand-600" strokeWidth={2.25} />
            <span className="sr-only">Kỳ báo cáo: </span>
            {periodText(period, f.options)}
          </button>
          {stepper ? (
            <button type="button" aria-label="Kỳ sau" disabled={!next} onClick={() => next && f.setFilters({ period: { mode: period.mode, key: next } })} className={arrowClass}>
              <ChevronRight aria-hidden className="size-[18px]" strokeWidth={2.25} />
            </button>
          ) : null}
        </div>
        {grade !== undefined ? <Pill onRemove={() => f.setFilters({ grade: undefined })} removeLabel="Bỏ lọc khối">{`Khối ${grade}`}</Pill> : null}
        {classCode ? <Pill onRemove={() => f.setFilters({ classCode: undefined })} removeLabel="Bỏ lọc lớp">{`Lớp ${classCode}`}</Pill> : null}
        {category ? (
          <Pill onRemove={() => f.setFilters({ category: undefined })} removeLabel="Bỏ lọc mảng" className="max-w-[220px]">
            {category}
          </Pill>
        ) : null}
        {errorCode ? (
          <Pill onRemove={() => f.setFilters({ errorCode: undefined })} removeLabel="Bỏ lọc lỗi" className="max-w-[240px]">
            {errorItem ? `${errorItem.code} · ${errorItem.issue}` : errorCode}
          </Pill>
        ) : null}
      </div>
    </div>
  );
}

export function FilterChipsSkeleton({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("h-10 w-64 rounded-full", className)} />;
}

/** Top-bar button (phones/tablets) opening the filter sheet; shows the number of active filters. */
export function FilterButton({ className }: { className?: string }) {
  const f = useFilters();
  const { setOpen } = useFilterSheet();
  const count = f.activeCount;
  return (
    <Button
      variant={count > 0 ? "outline" : "secondary"}
      size="sm"
      onClick={() => setOpen(true)}
      aria-label={count > 0 ? `Bộ lọc, đang áp dụng ${count} bộ lọc` : "Bộ lọc"}
      className={cn("px-2.5 pointer-coarse:min-w-11 sm:px-3", className)}
    >
      <SlidersHorizontal aria-hidden strokeWidth={2.25} />
      <span className="hidden sm:inline">Bộ lọc</span>
      {count > 0 ? (
        <span aria-hidden className="num inline-flex size-5 items-center justify-center rounded-full bg-star-500 text-2xs font-bold text-brand-950">
          {count}
        </span>
      ) : null}
    </Button>
  );
}
