"use client";
/**
 * Browser behaviour of the guide page: in-page navigation with a short highlight, scroll spy for the table of
 * contents, "back to top" visibility and FAQ expansion for printing.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLatest } from "@/components/ui/hooks";

const HIGHLIGHT_MS = 2600;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** "#muc-a" / "/huong-dan#muc-a" → "muc-a" (undefined for other links). */
export function guideAnchorOf(href: string): string | undefined {
  const m = /^(?:\/huong-dan\/?)?#(.+)$/.exec(href);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export interface GuideNavValue {
  /** Scrolls to an anchor of the page (clearing an active search first), updates the URL hash and highlights it. */
  goTo: (id: string, opts?: { push?: boolean }) => void;
}

const GuideNavContext = createContext<GuideNavValue | null>(null);
export const GuideNavProvider = GuideNavContext.Provider;

/** In-page navigation of the guide (null outside the guide page: links then behave as plain anchors). */
export function useGuideNav(): GuideNavValue | null {
  return useContext(GuideNavContext);
}

/**
 * In-page navigation: smooth scroll (instant with reduced motion), URL hash, a brief highlight
 * (`data-highlight` on the target, styled by the target's own classes) and focus on its heading.
 * Also handles the hash present on load (/huong-dan#xep-hang) and later hash changes.
 */
export function useGuideNavigation(searchActive: boolean, clearSearch: () => void): GuideNavValue {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEl = useRef<HTMLElement | null>(null);
  const searchRef = useLatest({ searchActive, clearSearch });

  const highlight = useCallback((el: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current);
    if (lastEl.current && lastEl.current !== el) delete lastEl.current.dataset.highlight;
    el.dataset.highlight = "true";
    lastEl.current = el;
    timer.current = setTimeout(() => {
      delete el.dataset.highlight;
      timer.current = null;
    }, HIGHLIGHT_MS);
  }, []);

  const reveal = useCallback(
    (id: string, smooth: boolean): boolean => {
      let el = document.getElementById(id);
      // A target hidden by the search filter cannot be scrolled to: show everything first (synchronously).
      // Visible matches keep the search, so result links work inside the filtered view.
      if (el && searchRef.current.searchActive && el.getClientRects().length === 0) {
        flushSync(() => searchRef.current.clearSearch());
        el = document.getElementById(id);
      }
      if (!el) return false;
      el.scrollIntoView({ behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto", block: "start" });
      const heading = el.querySelector<HTMLElement>("[data-guide-heading]") ?? el;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
      highlight(el);
      return true;
    },
    [highlight, searchRef],
  );

  const goTo = useCallback(
    (id: string, opts?: { push?: boolean }) => {
      if (!reveal(id, true)) return;
      const hash = `#${encodeURIComponent(id)}`;
      // Native history calls are supported by the Next.js App Router (it keeps its own state).
      if (window.location.hash !== hash) {
        if (opts?.push === false) window.history.replaceState(null, "", hash);
        else window.history.pushState(null, "", hash);
      }
    },
    [reveal],
  );

  useEffect(() => {
    const fromHash = (smooth: boolean) => {
      const id = guideAnchorOf(window.location.hash);
      if (id) reveal(id, smooth);
    };
    // Initial hash: the browser already jumped to the (server-rendered) anchor; re-align under the sticky bar and highlight.
    const raf = requestAnimationFrame(() => fromHash(false));
    const onHash = () => fromHash(true);
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", onHash);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reveal]);

  return { goTo };
}

/**
 * Id of the anchor currently at the top of the reading area (table of contents marker).
 * `ids` in document order; hidden elements (search filter) never count.
 */
export function useScrollSpy(ids: readonly string[]): string | undefined {
  const [active, setActive] = useState<string>();
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const order = key ? key.split("|") : [];
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = order.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      // Reading band: below the sticky top bar, upper 40% of the viewport.
      { rootMargin: "-72px 0px -60% 0px" },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key]);
  return active;
}

/** True once the page has been scrolled past `threshold` px ("Về đầu trang" button). */
export function useScrolledPast(threshold = 640): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setPast(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return past;
}

/** Opens every FAQ answer (`details[data-guide-faq]`) while printing, then restores what the reader had closed. */
export function usePrintExpand(): void {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [];
      document.querySelectorAll<HTMLDetailsElement>("details[data-guide-faq]").forEach((d) => {
        if (!d.open) {
          d.open = true;
          opened.push(d);
        }
      });
    };
    const after = () => {
      for (const d of opened) d.open = false;
      opened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}
