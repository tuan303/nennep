"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useMediaQuery } from "./hooks";

/* Only the first mounted <Toaster/> renders, so it is safe to include it in several layouts. */
let owners: symbol[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function useIsPrimary(): boolean {
  const [me] = useState(() => Symbol("toaster"));
  useEffect(() => {
    owners = [...owners, me];
    emit();
    return () => {
      owners = owners.filter((o) => o !== me);
      emit();
    };
  }, [me]);
  return useSyncExternalStore(
    subscribe,
    () => owners[0] === me,
    () => false,
  );
}

/** Brand-tuned rich colours (sonner reads these CSS variables). */
const VARS = {
  fontFamily: "inherit",
  "--normal-bg": "#ffffff",
  "--normal-border": "#e4e9f2",
  "--normal-text": "#0f172a",
  "--success-bg": "#f0faf4",
  "--success-border": "#bfe6cd",
  "--success-text": "#15803d",
  "--error-bg": "#fef2f2",
  "--error-border": "#f7c6c6",
  "--error-text": "#b91c1c",
  "--warning-bg": "#fffbeb",
  "--warning-border": "#f6dd9a",
  "--warning-text": "#8a5300",
  "--info-bg": "#eef0fa",
  "--info-border": "#bfd3fe",
  "--info-text": "#23328c",
  "--border-radius": "12px",
} as CSSProperties;

/**
 * App-wide toast host (sonner). Top-center on phones (clear of the bottom tab bar), bottom-right on desktop.
 * Use `toast.success("Đã lưu sự việc")`, `toast.error(message)`, `toast.promise(...)` anywhere.
 */
export function Toaster() {
  const isPrimary = useIsPrimary();
  const desktop = useMediaQuery("(min-width: 640px)");
  if (!isPrimary) return null;
  return (
    <Sonner
      position={desktop ? "bottom-right" : "top-center"}
      richColors
      closeButton
      duration={4500}
      visibleToasts={4}
      offset={desktop ? 24 : 16}
      mobileOffset={{ top: 12, left: 12, right: 12 }}
      style={VARS}
      containerAriaLabel="Thông báo"
      icons={{
        success: <CircleCheck className="size-[18px]" strokeWidth={2.25} />,
        error: <CircleAlert className="size-[18px]" strokeWidth={2.25} />,
        warning: <TriangleAlert className="size-[18px]" strokeWidth={2.25} />,
        info: <Info className="size-[18px]" strokeWidth={2.25} />,
      }}
      toastOptions={{
        classNames: {
          toast: "shadow-raised! gap-2.5! text-sm! items-start!",
          title: "font-semibold! leading-5!",
          description: "text-[13px]! leading-5! opacity-90!",
          actionButton: "rounded-lg! font-semibold!",
          cancelButton: "rounded-lg!",
          icon: "mt-px!",
        },
      }}
    />
  );
}

export { toast };
