"use client";

import * as RD from "@radix-ui/react-dialog";
import { useEffect, useId, useState, type ReactNode } from "react";
import { CircleQuestionMark, TriangleAlert } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";
import { dialogFooterClass, overlayClass } from "./dialog";
import { Input } from "./input";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" = red button + warning icon (delete, reset…). */
  tone?: "danger" | "primary";
  /** The user must type this exact text (trimmed, case-insensitive) before confirming. */
  requireText?: string;
  /**
   * Runs on confirm. If it returns a promise the button shows a spinner; the dialog closes when it
   * resolves and stays open if it rejects (show the error with toast inside your handler).
   */
  onConfirm: () => void | Promise<void>;
  /** Extra condition, e.g. a reason field below is still empty. */
  confirmDisabled?: boolean;
  /** Extra content under the message (e.g. a "Lý do" textarea). */
  children?: ReactNode;
}

/** Confirmation modal (alertdialog) with optional typed confirmation for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  tone = "primary",
  requireText,
  onConfirm,
  confirmDisabled,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  const textOk = !requireText || typed.trim().toLocaleLowerCase("vi") === requireText.trim().toLocaleLowerCase("vi");
  const canConfirm = textOk && !confirmDisabled && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    try {
      setBusy(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Caller reports the error (toast); keep the dialog open so the user can retry.
    } finally {
      setBusy(false);
    }
  }

  const Icon = tone === "danger" ? TriangleAlert : CircleQuestionMark;

  return (
    <RD.Root open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <RD.Portal>
        <RD.Overlay className={overlayClass} />
        <RD.Content
          role="alertdialog"
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[18px] bg-surface shadow-pop outline-none ring-1 ring-brand-950/5 data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out"
          {...(message ? {} : { "aria-describedby": undefined })}
        >
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
          >
            <div className="flex min-h-0 gap-4 overflow-y-auto px-4 pb-5 pt-5 sm:px-6 sm:pt-6">
              <span
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-full ring-4 sm:ring-8",
                  tone === "danger" ? "bg-bad-soft text-bad ring-bad-soft/50" : "bg-brand-50 text-brand-600 ring-brand-50/60",
                )}
              >
                <Icon aria-hidden className="size-[22px]" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <RD.Title className="text-[17px] font-semibold leading-6 text-brand-900">{title}</RD.Title>
                {message ? <RD.Description className="mt-1.5 text-sm leading-relaxed text-slate-600">{message}</RD.Description> : null}
                {children ? <div className="mt-4">{children}</div> : null}
                {requireText ? (
                  <div className="mt-4 flex flex-col gap-1.5">
                    <label htmlFor={inputId} className="text-[13px] text-slate-600">
                      Nhập <strong className="select-all rounded bg-surface-3 px-1.5 py-0.5 font-semibold text-slate-900">{requireText}</strong> để xác nhận
                    </label>
                    <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className={dialogFooterClass}>
              <RD.Close asChild>
                <Button variant="secondary" disabled={busy}>
                  {cancelLabel}
                </Button>
              </RD.Close>
              <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={busy} disabled={!textOk || confirmDisabled}>
                {confirmLabel}
              </Button>
            </div>
          </form>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
