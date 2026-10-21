import { cn } from "./cn";

export interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";
  /** Screen-reader text. Pass "" when a parent already announces the busy state. */
  label?: string;
  className?: string;
}

const SIZES = { xs: "size-3.5 border-[1.5px]", sm: "size-4 border-2", md: "size-6 border-[2.5px]", lg: "size-9 border-[3px]" };

/** Circular busy indicator. Inherits `currentColor`. */
export function Spinner({ size = "md", label = "Đang tải", className }: SpinnerProps) {
  return (
    <span role={label ? "status" : undefined} className={cn("inline-flex shrink-0 items-center justify-center", className)}>
      <span
        aria-hidden
        className={cn(
          "animate-spin rounded-full border-current border-r-transparent opacity-80",
          SIZES[size],
        )}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
