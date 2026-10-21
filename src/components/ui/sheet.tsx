"use client";

import * as RD from "@radix-ui/react-dialog";
import { useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { closeButtonClass, dialogFooterClass, overlayClass } from "./dialog";
import { useLatest } from "./hooks";
import { sheetDragOutcome } from "./sheet-drag";

export type SheetSide = "bottom" | "right" | "auto";

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the sheet (uncontrolled usage). */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  footer?: ReactNode;
  /** "auto" = bottom sheet on phones (<768px), right drawer on tablets/desktops. */
  side?: SheetSide;
  /** Drawer width on the right / max height at the bottom. */
  size?: "sm" | "md" | "lg";
  /**
   * false = taps on the overlay, Esc and dragging the handle do not close the sheet (unsaved form, running import).
   * The × button still asks `onOpenChange(false)`, so the owner decides.
   */
  dismissible?: boolean;
  hideClose?: boolean;
  className?: string;
  bodyClassName?: string;
}

const BOTTOM =
  "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[22px] pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down";
const RIGHT = "inset-y-0 right-0 h-dvh rounded-l-[22px] data-[state=open]:animate-sheet-left data-[state=closed]:animate-sheet-right";
const AUTO =
  "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[92dvh] max-md:rounded-t-[22px] max-md:pb-[env(safe-area-inset-bottom)] max-md:data-[state=open]:animate-sheet-up max-md:data-[state=closed]:animate-sheet-down " +
  "md:inset-y-0 md:right-0 md:h-dvh md:rounded-l-[22px] md:data-[state=open]:animate-sheet-left md:data-[state=closed]:animate-sheet-right";

const WIDTH = { sm: "w-[min(100vw,380px)]", md: "w-[min(100vw,480px)]", lg: "w-[min(100vw,680px)]" };
const AUTO_WIDTH = { sm: "md:w-[380px]", md: "md:w-[480px]", lg: "md:w-[680px]" };

function isBottomNow(side: SheetSide): boolean {
  if (side === "bottom") return true;
  if (side === "right") return false;
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767.98px)").matches;
}

/**
 * Side panel / bottom sheet (Radix Dialog). Bottom sheets show a drag handle and can be
 * dragged down to close (unless `dismissible={false}`). Content scrolls inside; header and footer stay put.
 */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  icon: Icon,
  children,
  footer,
  side = "auto",
  size = "md",
  dismissible = true,
  hideClose,
  className,
  bodyClassName,
}: SheetProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (v: boolean) => {
    if (open === undefined) setInnerOpen(v);
    onOpenChange?.(v);
  };

  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number; t: number } | null>(null);
  const openRef = useLatest(isOpen);

  function snapBack(el: HTMLElement) {
    el.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
    el.style.transform = "";
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!isBottomNow(side) || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button,a,input,select,textarea")) return;
    drag.current = { y: e.clientY, dy: 0, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = contentRef.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.clientY - d.y);
    el.style.transition = "none";
    el.style.transform = `translateY(${d.dy}px)`;
  }
  function onPointerUp() {
    const d = drag.current;
    const el = contentRef.current;
    drag.current = null;
    if (!d || !el) return;
    if (sheetDragOutcome(d.dy, performance.now() - d.t, dismissible) === "close") {
      setOpen(false); // exit animation continues from the dragged position
      // The owner may refuse to close (saving, importing…): don't leave the sheet hanging half off-screen.
      requestAnimationFrame(() => {
        if (openRef.current && el.isConnected) snapBack(el);
      });
      return;
    }
    snapBack(el);
  }

  const sideClass = side === "bottom" ? BOTTOM : side === "right" ? cn(RIGHT, WIDTH[size]) : cn(AUTO, AUTO_WIDTH[size]);
  const showHandle = side !== "right";

  return (
    <RD.Root open={isOpen} onOpenChange={setOpen}>
      {trigger ? <RD.Trigger asChild>{trigger}</RD.Trigger> : null}
      <RD.Portal>
        <RD.Overlay className={overlayClass} />
        <RD.Content
          ref={contentRef}
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          className={cn("fixed z-50 flex flex-col bg-surface shadow-pop outline-none ring-1 ring-brand-950/5", sideClass, className)}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div
            className={cn("shrink-0 select-none", showHandle && "touch-none", side === "auto" && "md:touch-auto")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {showHandle ? (
              <div aria-hidden className={cn("flex justify-center pb-1 pt-2.5", side === "auto" && "md:hidden")}>
                <span className="h-1.5 w-10 rounded-full bg-slate-300" />
              </div>
            ) : null}
            <div className={cn("flex items-start gap-3 border-b border-border px-4 pb-3 sm:px-5", showHandle ? "pt-1.5" : "pt-4", side === "auto" && "md:pt-5")}>
              {Icon ? (
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                  <Icon aria-hidden className="size-[18px]" strokeWidth={2.25} />
                </span>
              ) : null}
              <div className="min-w-0 flex-1 pt-1">
                <RD.Title className="text-[17px] font-semibold leading-6 text-brand-900">{title}</RD.Title>
                {description ? <RD.Description className="mt-0.5 text-[13px] leading-5 text-slate-500">{description}</RD.Description> : null}
              </div>
              {!hideClose ? (
                <RD.Close className={cn(closeButtonClass, "-mr-1.5")} aria-label="Đóng">
                  <X aria-hidden className="size-5" strokeWidth={2.25} />
                </RD.Close>
              ) : null}
            </div>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5", bodyClassName)}>{children}</div>
          {footer != null ? <div className={cn(dialogFooterClass, "bg-surface")}>{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
