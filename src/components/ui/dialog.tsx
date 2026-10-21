"use client";

import * as RD from "@radix-ui/react-dialog";
import type { ReactElement, ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export const overlayClass =
  "fixed inset-0 z-50 bg-brand-950/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out";

export const closeButtonClass =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:size-11";

/** Footer row: stacked full-width buttons on phones, right-aligned on larger screens. */
export const dialogFooterClass =
  "flex flex-col-reverse gap-2 border-t border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5 [&>*]:w-full sm:[&>*]:w-auto";

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (uncontrolled usage). Must accept a ref (Button does). */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** false = clicks outside / Esc do not close (unsaved forms). */
  dismissible?: boolean;
  hideClose?: boolean;
  className?: string;
  bodyClassName?: string;
}

const WIDTH = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

/** Centered modal (Radix Dialog): focus trap, Esc, scroll lock, labelled by title/description. */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  icon: Icon,
  children,
  footer,
  size = "md",
  dismissible = true,
  hideClose,
  className,
  bodyClassName,
}: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <RD.Trigger asChild>{trigger}</RD.Trigger> : null}
      <RD.Portal>
        <RD.Overlay className={overlayClass} />
        <RD.Content
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[18px] bg-surface shadow-pop ring-1 ring-brand-950/5 outline-none",
            "data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out",
            WIDTH[size],
            className,
          )}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            {Icon ? (
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon aria-hidden className="size-5" strokeWidth={2.25} />
              </span>
            ) : null}
            <div className="min-w-0 flex-1 pt-0.5">
              <RD.Title className="text-[17px] font-semibold leading-6 text-brand-900">{title}</RD.Title>
              {description ? <RD.Description className="mt-1 text-sm leading-relaxed text-slate-600">{description}</RD.Description> : null}
            </div>
            {!hideClose ? (
              <RD.Close className={cn(closeButtonClass, "-mr-1.5 -mt-1")} aria-label="Đóng">
                <X aria-hidden className="size-5" strokeWidth={2.25} />
              </RD.Close>
            ) : null}
          </div>
          {children != null ? <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5", bodyClassName)}>{children}</div> : null}
          {footer != null ? <div className={dialogFooterClass}>{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Close the nearest Dialog/Sheet from inside (e.g. a "Hủy" button): `<DialogClose asChild><Button…/></DialogClose>`. */
export const DialogClose = RD.Close;
