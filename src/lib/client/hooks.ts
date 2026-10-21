"use client";
/**
 * Small shared React hooks.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { todayVN } from "@/lib/engine/dates";

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** Today's date in Vietnam ("yyyy-mm-dd"); updates right after midnight (VN) and when the tab becomes visible. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayVN());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const msSinceVnMidnight = (Date.now() + VN_OFFSET_MS) % DAY_MS;
      timer = setTimeout(() => {
        setToday(todayVN());
        schedule();
      }, DAY_MS - msSinceVnMidnight + 1_000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") setToday(todayVN());
    };
    setToday(todayVN());
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return today;
}

/** `window.matchMedia(query).matches`, live. Returns `serverValue` during SSR/hydration. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Mobile layout breakpoint (< 768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767.98px)");
}

/** `value`, updated only after it stopped changing for `delayMs` (e.g. search inputs). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** `navigator.onLine`, live (true during SSR). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
