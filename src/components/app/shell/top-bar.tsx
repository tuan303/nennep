"use client";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton, cn } from "@/components/ui";
import { FilterButton } from "./filter-bar";
import { CONTENT_MAX_W, GUTTER_X } from "./layout-classes";
import { LevelSwitcher } from "./level-switcher";
import { LogoMark } from "./logo";
import { SyncIndicator } from "./sync-indicator";
import { UserMenu } from "./user-menu";
import { usePageChrome } from "./use-nav";

/**
 * Sticky top bar. Phones: logo · level select … sync · "Bộ lọc" · avatar.
 * Tablets/desktops: page title · level segmented control … sync · ("Bộ lọc" < 1024px) · user menu.
 */
export function TopBar() {
  const { title, showFilters, showLevelSwitcher } = usePageChrome();
  return (
    <header data-print-hide className="sticky top-0 z-30 border-b border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      {/* Level accent bar (Tiểu học vàng · THCS xanh lá · THPT navy · toàn trường đỏ NSHM). */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-acc transition-colors" />
      <div className={cn(CONTENT_MAX_W, GUTTER_X, "flex h-14 items-center gap-2 sm:gap-3 lg:h-16")}>
        <Link href="/" className="-ml-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500 md:hidden">
          <LogoMark size="sm" label="NSHM Nền nếp – Tổng quan" />
        </Link>
        <p className="hidden min-w-0 truncate text-base font-semibold text-brand-900 md:block lg:text-[17px]" aria-hidden>
          {title}
        </p>
        {showLevelSwitcher ? (
          <>
            <span aria-hidden className="hidden h-6 w-px shrink-0 bg-border md:block" />
            <LevelSwitcher className="shrink-0" />
          </>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <SyncIndicator />
          {showFilters ? (
            <Suspense fallback={<Skeleton className="h-9 w-11 rounded-control lg:hidden" />}>
              <FilterButton className="lg:hidden" />
            </Suspense>
          ) : null}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
