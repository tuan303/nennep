import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";

/**
 * Placeholder for a dashboard-like page: header, KPI row and two content cards.
 * Used by DatasetGate and as the Suspense fallback of the app shell.
 */
export function PageSkeleton({ kpis = 4, className, label = "Đang tải dữ liệu…" }: { kpis?: number; className?: string; label?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-5", className)}>
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-48 max-w-[60%]" />
          <Skeleton className="h-3.5 w-80 max-w-[85%]" />
        </div>
      </div>
      {kpis > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: kpis }, (_, i) => (
            <div key={i} className="card flex flex-col gap-3 p-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card flex flex-col gap-4 p-4 sm:p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
        <div className="card flex flex-col gap-4 p-4 sm:p-5">
          <Skeleton className="h-5 w-32" />
          <SkeletonText lines={6} />
        </div>
      </div>
    </div>
  );
}
