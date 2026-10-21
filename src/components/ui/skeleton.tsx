import type { CSSProperties } from "react";
import { cn } from "./cn";

export interface SkeletonProps {
  className?: string;
  /** Pill shape (badges, avatars) instead of the control radius. */
  round?: boolean;
  style?: CSSProperties;
}

/** Placeholder block with a soft shimmer. Size it with classes (h-4 w-24…) to match the final content (no layout shift). */
export function Skeleton({ className, round, style }: SkeletonProps) {
  return <span aria-hidden style={style} className={cn("shimmer block h-4 w-full", round ? "rounded-full" : "rounded-md", className)} />;
}

/** Several text lines; the last one is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}

/** Generic page-block placeholder: announces loading to screen readers once. */
export function SkeletonCard({ className, rows = 3, label = "Đang tải dữ liệu" }: { className?: string; rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("card flex flex-col gap-4 p-4 sm:p-5", className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-40" />
      <SkeletonText lines={rows} />
    </div>
  );
}
