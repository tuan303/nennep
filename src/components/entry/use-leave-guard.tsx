"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui";
import { SAME_PATH_AND_QUERY, leavingHref, registerLeaveHandler, type SamePage } from "./lib/leave-guard";

export interface LeaveGuardOptions {
  /** The page holds unsaved input. */
  when: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The user agreed to drop the input (forget any kept draft). */
  onDiscard?: () => void;
  /** Links that keep this page mounted (no question asked); default: same path and query. */
  samePage?: SamePage;
}

type Pending = { href: string } | { proceed: () => void };

/**
 * While `when` is true: the browser asks before a reload / tab close, and in-app link clicks (sidebar, bottom tab bar,
 * "Sửa" links…) and `requestLeave(...)` callers open a confirmation first. Render the returned dialog in the page.
 */
export function useLeaveGuard({
  when,
  title,
  message,
  confirmLabel = "Bỏ và rời trang",
  cancelLabel = "Ở lại",
  onDiscard,
  samePage = SAME_PATH_AND_QUERY,
}: LeaveGuardOptions): ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const discardRef = useRef(onDiscard);
  const samePageRef = useRef(samePage);
  useEffect(() => {
    discardRef.current = onDiscard;
    samePageRef.current = samePage;
  });

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Capture phase on window: runs before React's handlers, so next/link sees `defaultPrevented` and does not navigate.
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const target = { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute("download") };
      const href = leavingHref(e, target, window.location.href, samePageRef.current);
      if (!href) return;
      e.preventDefault();
      setPending({ href });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    const unregister = registerLeaveHandler((proceed) => setPending({ proceed }));
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
      unregister();
    };
  }, [when]);

  function leave() {
    const target = pending;
    setPending(null);
    if (!target) return;
    discardRef.current?.();
    if ("href" in target) router.push(target.href);
    else target.proceed();
  }

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      tone="danger"
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={leave}
    />
  );
}
