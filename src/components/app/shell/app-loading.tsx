"use client";
import { CloudOff, LogOut } from "lucide-react";
import { Button, Skeleton, cn } from "@/components/ui";
import { CONTENT_MAX_W, GUTTER_X } from "./layout-classes";
import { LogoMark, Logo } from "./logo";
import { PageSkeleton } from "./page-skeleton";

export interface AppLoadingScreenProps {
  /** Shown while the profile keeps failing to load (auto-retrying), e.g. offline. */
  message?: string;
  /** Escape hatch next to `message`. */
  onSignOut?: () => void;
}

/** Full-screen branded skeleton of the app shell, shown while the session/profile loads (also server-rendered). */
export function AppLoadingScreen({ message, onSignOut }: AppLoadingScreenProps) {
  return (
    <div className="flex min-h-dvh">
      <aside aria-hidden className="sticky top-0 hidden h-dvh shrink-0 flex-col bg-brand-900 md:flex md:w-[76px] lg:w-[264px]">
        <div className="flex h-16 items-center px-[18px] lg:px-5">
          <span className="lg:hidden">
            <LogoMark />
          </span>
          <span className="hidden lg:inline-flex">
            <Logo tone="light" />
          </span>
        </div>
        <div className="flex flex-col gap-2 px-3 pt-4 lg:px-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex h-10 items-center gap-3 px-2.5">
              <span className="size-5 shrink-0 animate-pulse rounded-md bg-white/10" />
              <span className="hidden h-3 animate-pulse rounded bg-white/10 lg:block" style={{ width: `${55 + ((i * 37) % 40)}%` }} />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header aria-hidden className="sticky top-0 z-30 border-b border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className={cn(CONTENT_MAX_W, GUTTER_X, "flex h-14 items-center gap-3 lg:h-16")}>
            <span className="md:hidden">
              <LogoMark size="sm" />
            </span>
            <Skeleton className="h-8 w-28 rounded-control md:w-40" />
            <Skeleton className="ml-auto size-8" round />
            <Skeleton className="size-9" round />
          </div>
        </header>
        <main className={cn(CONTENT_MAX_W, GUTTER_X, "flex-1 pb-24 pt-4 lg:pt-6")}>
          {message ? (
            <div role="alert" className="mb-5 flex flex-col gap-3 rounded-card bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/25 sm:flex-row sm:items-center">
              <span className="flex flex-1 items-start gap-2.5">
                <CloudOff aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.25} />
                <span>{message}</span>
              </span>
              {onSignOut ? (
                <Button variant="secondary" size="sm" icon={LogOut} onClick={onSignOut}>
                  Đăng xuất
                </Button>
              ) : null}
            </div>
          ) : null}
          <PageSkeleton label="Đang tải ứng dụng…" />
        </main>
      </div>
      <div aria-hidden className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 items-center border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="flex justify-center">
            <Skeleton className={i === 2 ? "size-11" : "size-6"} round={i === 2} />
          </span>
        ))}
      </div>
    </div>
  );
}
