"use client";
/**
 * Full-page branded status (404, unexpected error, access blocked) used outside the app shell.
 * Client module: server files must render the ready-made screens (e.g. <NotFoundScreen />) because icon components
 * cannot be passed as props across the server → client boundary.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, House, RefreshCw, SearchX, type LucideIcon } from "lucide-react";
import { Button, buttonClasses, cn } from "@/components/ui";
import { SCHOOL_NAME } from "@/lib/constants";
import { Logo, STAR_PATH } from "./logo";

export interface StatusScreenProps {
  icon: LucideIcon;
  tone?: "brand" | "bad" | "warn";
  /** Big faint code above the title, e.g. "404". */
  code?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Primary link (default: "Về Tổng quan" → "/"). Pass null to hide. */
  home?: { href: string; label: string } | null;
  /** Shows "Quay lại" (browser history). */
  showBack?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra content under the actions (e.g. an error reference). */
  footer?: ReactNode;
  /** Custom body instead of the action buttons. */
  children?: ReactNode;
}

const TILE: Record<NonNullable<StatusScreenProps["tone"]>, string> = {
  brand: "bg-brand-50 text-brand-600 ring-brand-600/10",
  bad: "bg-bad-soft text-bad ring-bad/15",
  warn: "bg-warn-soft text-warn-strong ring-warn/20",
};

export function StatusScreen({
  icon: Icon,
  tone = "brand",
  code,
  title,
  description,
  home = { href: "/", label: "Về Tổng quan" },
  showBack,
  onRetry,
  retryLabel = "Thử lại",
  footer,
  children,
}: StatusScreenProps) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-100/70 to-transparent" />
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute -right-24 -top-24 size-[420px] rotate-12 text-star-400/15">
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
      <header className="relative px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <Link href="/" className="inline-flex rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500">
          <Logo size="sm" />
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="card w-full max-w-lg px-6 py-10 text-center sm:px-10">
          {code ? (
            <p aria-hidden className="num -mt-2 mb-2 bg-gradient-to-b from-brand-200 to-brand-50 bg-clip-text text-[72px] font-extrabold leading-none tracking-tight text-transparent">
              {code}
            </p>
          ) : null}
          <span className={cn("relative mx-auto inline-flex size-14 items-center justify-center rounded-2xl ring-1 ring-inset", TILE[tone])}>
            <Icon aria-hidden className="size-7" strokeWidth={1.75} />
            <span aria-hidden className="absolute -right-1.5 -top-1.5 size-2.5 rotate-45 rounded-[2px] bg-star-400 ring-2 ring-surface" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-brand-900 sm:text-[22px]">{title}</h1>
          {description ? <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{description}</p> : null}
          {children ?? (
            <div className="mt-6 flex flex-col-reverse items-stretch justify-center gap-2 sm:flex-row sm:items-center">
              {showBack ? (
                <Button variant="ghost" icon={ArrowLeft} onClick={() => window.history.back()}>
                  Quay lại
                </Button>
              ) : null}
              {onRetry ? (
                <Button variant={home ? "secondary" : "primary"} icon={RefreshCw} onClick={onRetry}>
                  {retryLabel}
                </Button>
              ) : null}
              {home ? (
                <Link href={home.href} className={buttonClasses({ variant: "primary" })}>
                  <House aria-hidden className="size-[18px]" strokeWidth={2.25} />
                  {home.label}
                </Link>
              ) : null}
            </div>
          )}
          {footer ? <div className="mt-6 text-xs text-slate-500">{footer}</div> : null}
        </div>
      </main>
      <footer className="relative px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-slate-500">{SCHOOL_NAME}</footer>
    </div>
  );
}

/** Branded 404 page (root not-found). */
export function NotFoundScreen() {
  return (
    <StatusScreen
      icon={SearchX}
      code="404"
      title="Không tìm thấy trang"
      description="Đường dẫn có thể đã thay đổi hoặc trang không còn tồn tại. Vui lòng kiểm tra lại địa chỉ hoặc quay về trang Tổng quan."
      showBack
    />
  );
}
