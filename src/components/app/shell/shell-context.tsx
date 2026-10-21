"use client";
/**
 * Per-page shell options (title, filter bar, level switcher), nav badges and the shared filter sheet state.
 * Pages call `useShellOptions({ hideFilters: true })`; widgets call `useNavBadge("/du-lieu", 12)`.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

export interface ShellOptions {
  /** Top-bar title (default: the route title from the nav config). */
  title?: string;
  /** true hides the global filter bar, false forces it; undefined = route default. */
  hideFilters?: boolean;
  /** true hides the level switcher, false forces it; undefined = route default. */
  hideLevelSwitcher?: boolean;
}

export type NavBadgeValue = number | string;

interface ShellContextValue {
  options: ShellOptions;
  setOptions: (owner: symbol, options: ShellOptions | null) => void;
  badges: Readonly<Record<string, NavBadgeValue>>;
  setBadge: (href: string, value: NavBadgeValue | null) => void;
  filterSheetOpen: boolean;
  setFilterSheetOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ShellProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<{ owner?: symbol; options: ShellOptions }>({ options: {} });
  const [badges, setBadges] = useState<Record<string, NavBadgeValue>>({});
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const setOptions = useCallback((owner: symbol, options: ShellOptions | null) => {
    setEntry((cur) => {
      if (options) return { owner, options };
      // Only the page that set the options may clear them (avoids races during route transitions).
      return cur.owner === owner ? { options: {} } : cur;
    });
  }, []);

  const setBadge = useCallback((href: string, value: NavBadgeValue | null) => {
    setBadges((cur) => {
      if (value === null || value === 0 || value === "") {
        if (!(href in cur)) return cur;
        const next = { ...cur };
        delete next[href];
        return next;
      }
      return cur[href] === value ? cur : { ...cur, [href]: value };
    });
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({ options: entry.options, setOptions, badges, setBadge, filterSheetOpen, setFilterSheetOpen }),
    [entry.options, setOptions, badges, setBadge, filterSheetOpen],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** Internal: shell components read the current state. */
export function useShellContext(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("Shell hooks must be used inside the app shell (src/app/(app)/layout.tsx).");
  return ctx;
}

/**
 * Configure the shell for the current page (call at the top of a page component):
 * `useShellOptions({ hideFilters: true })`, `useShellOptions({ title: "Lớp 6A01" })`.
 * Options are reset when the page unmounts. No-op outside the app shell.
 */
export function useShellOptions({ title, hideFilters, hideLevelSwitcher }: ShellOptions): void {
  const setOptions = useContext(ShellContext)?.setOptions;
  const [owner] = useState(() => Symbol("shell-options"));
  useIsoLayoutEffect(() => {
    if (!setOptions) return;
    setOptions(owner, { title, hideFilters, hideLevelSwitcher });
    return () => setOptions(owner, null);
  }, [setOptions, owner, title, hideFilters, hideLevelSwitcher]);
}

/**
 * Show a badge on a nav item (sidebar, "Thêm" sheet), e.g. the review-queue size:
 * `useNavBadge("/du-lieu", reviewCount)`. 0 / null / undefined removes it. Removed on unmount.
 */
export function useNavBadge(href: string, value: NavBadgeValue | null | undefined): void {
  const setBadge = useContext(ShellContext)?.setBadge;
  useEffect(() => {
    if (!setBadge) return;
    setBadge(href, value ?? null);
    return () => setBadge(href, null);
  }, [setBadge, href, value]);
}

/** Open/close the shared filter sheet (phones and tablets). */
export function useFilterSheet(): { open: boolean; setOpen: (open: boolean) => void } {
  const { filterSheetOpen, setFilterSheetOpen } = useShellContext();
  return { open: filterSheetOpen, setOpen: setFilterSheetOpen };
}
