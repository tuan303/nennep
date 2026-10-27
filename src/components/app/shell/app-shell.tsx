"use client";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { useLevel } from "@/lib/client/data";
import { useSession } from "@/lib/client/session";
import { AccountBlockedScreen } from "./account-blocked";
import { AppLoadingScreen } from "./app-loading";
import { BottomNav } from "./bottom-nav";
import { CreditLine } from "./credit-line";
import { FilterBar, FilterBarSkeleton, FilterChips, FilterChipsSkeleton } from "./filter-bar";
import { FilterSheet } from "./filter-sheet";
import { CONTENT_MAX_W, GUTTER_X } from "./layout-classes";
import { PageSkeleton } from "./page-skeleton";
import { REGULATION_ROUTE_BASE } from "./routes";
import { ShellProvider } from "./shell-context";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { consumeExplicitSignOut, usePageChrome, useSignOut } from "./use-nav";

/** Login URL that brings the user back to `path` (+ query) after signing in. */
export function loginHref(path: string): string {
  return path && path !== "/" ? `/dang-nhap?next=${encodeURIComponent(path)}` : "/dang-nhap";
}

/**
 * Client guard + chrome for every signed-in page (src/app/(app)/layout.tsx):
 * loading → branded skeleton; signed out → /dang-nhap?next=…; forbidden → blocked screen; signed in → shell.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, error } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const signOut = useSignOut();

  useEffect(() => {
    if (status !== "signedOut") return;
    const explicit = consumeExplicitSignOut();
    router.replace(explicit ? "/dang-nhap" : loginHref(pathname + window.location.search));
  }, [status, pathname, router]);

  if (status === "signedIn") return <ShellFrame>{children}</ShellFrame>;
  if (status === "forbidden") return <AccountBlockedScreen />;
  return <AppLoadingScreen message={status === "loading" ? error : undefined} onSignOut={error ? () => void signOut() : undefined} />;
}

/**
 * Level identity on <html data-cap>: accents (header bar, selected level, tab underline, page eyebrow) take the colour
 * of the level being viewed; the school-wide pages (Toàn trường, the quy chế) keep the NSHM red (globals.css).
 */
function useLevelAccent() {
  const { levelId } = useLevel();
  const pathname = usePathname() ?? "/";
  const schoolWide = pathname.startsWith("/toan-truong") || pathname.startsWith(`${REGULATION_ROUTE_BASE}/`);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (schoolWide || !levelId) root.removeAttribute("data-cap");
    else root.setAttribute("data-cap", levelId);
    return () => root.removeAttribute("data-cap");
  }, [levelId, schoolWide]);
}

function ShellFrame({ children }: { children: ReactNode }) {
  useLevelAccent();
  return (
    <ShellProvider>
      <a
        href="#main-content"
        className="sr-only z-[80] rounded-control bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Bỏ qua thanh điều hướng
      </a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(CONTENT_MAX_W, GUTTER_X, "flex flex-1 flex-col pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 outline-none md:pb-8 lg:pt-6")}
          >
            {/* Block wrapper: pages keep their normal flow; flex-1 pushes the credit line to the bottom on short pages. */}
            <div className="min-w-0 flex-1">
              <PageFilters />
              <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
            </div>
            {/* Inside main's bottom padding, so the phone tab bar never covers it; hidden when printing. */}
            <CreditLine className="mt-10" />
          </main>
        </div>
        <BottomNav />
      </div>
    </ShellProvider>
  );
}

/** Global filters above the page content: inline bar (≥ 1024px) or context chips + sheet (smaller screens). */
function PageFilters() {
  const { showFilters } = usePageChrome();
  if (!showFilters) return null;
  return (
    <div data-print-hide className="mb-5 lg:mb-6">
      <div className="hidden lg:block">
        <Suspense fallback={<FilterBarSkeleton />}>
          <FilterBar />
        </Suspense>
      </div>
      <div className="lg:hidden">
        <Suspense fallback={<FilterChipsSkeleton />}>
          <FilterChips />
          <FilterSheet />
        </Suspense>
      </div>
    </div>
  );
}
