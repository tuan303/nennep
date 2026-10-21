import type { ReactNode } from "react";
import { CloudOff, Inbox, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";
import { toneTile, type Tone } from "./tones";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a Button that helps the user move on ("Nhập sự việc", "Xóa bộ lọc"). */
  action?: ReactNode;
  tone?: Tone;
  /** "sm" for cards/charts, "md" for whole pages. */
  size?: "sm" | "md";
  className?: string;
}

/** Friendly "nothing here" block that tells the user what to do next. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, tone = "brand", size = "md", className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "sm" ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      <span className="relative">
        <span
          aria-hidden
          className={cn(
            "inline-flex items-center justify-center rounded-2xl ring-1 ring-inset",
            toneTile[tone],
            size === "sm" ? "size-11" : "size-14",
          )}
        >
          <Icon className={size === "sm" ? "size-5" : "size-7"} strokeWidth={1.75} />
        </span>
        <span aria-hidden className="absolute -right-1.5 -top-1.5 size-2.5 rotate-45 rounded-[2px] bg-star-400 ring-2 ring-surface" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className={cn("font-semibold text-brand-900", size === "sm" ? "text-sm" : "text-base")}>{title}</p>
        {description ? <p className={cn("leading-relaxed text-slate-500", size === "sm" ? "text-[13px]" : "text-sm")}>{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  /** Vietnamese message safe to show (e.g. ApiClientError.message). */
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  icon?: LucideIcon;
  size?: "sm" | "md";
  className?: string;
}

/** Error block with a retry button. Announced to screen readers (role="alert"). */
export function ErrorState({
  title = "Chưa tải được dữ liệu",
  message = "Kết nối có thể đang gián đoạn. Vui lòng thử lại sau ít phút.",
  onRetry,
  retryLabel = "Thử lại",
  retrying,
  icon: Icon = CloudOff,
  size = "md",
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center text-center", size === "sm" ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12", className)}>
      <span
        aria-hidden
        className={cn("inline-flex items-center justify-center rounded-2xl bg-bad-soft text-bad ring-1 ring-inset ring-bad/15", size === "sm" ? "size-11" : "size-14")}
      >
        <Icon className={size === "sm" ? "size-5" : "size-7"} strokeWidth={1.75} />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className={cn("font-semibold text-brand-900", size === "sm" ? "text-sm" : "text-base")}>{title}</p>
        {message ? <p className={cn("leading-relaxed text-slate-600", size === "sm" ? "text-[13px]" : "text-sm")}>{message}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={RefreshCw} loading={retrying} onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
