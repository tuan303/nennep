"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Stretch segments to fill the width (mobile level switcher). */
  fullWidth?: boolean;
  /** Accessible name of the group, e.g. "Chọn cấp học". */
  ariaLabel?: string;
  className?: string;
  /** Classes for the selected segment (default: white raised chip). E.g. the level switcher uses the level colour. */
  activeClassName?: string;
}

/** Single-choice switch (radiogroup). Arrow keys move the selection. */
export function SegmentedControl<T extends string>({ options, value, onChange, size = "md", fullWidth, ariaLabel, className, activeClassName }: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function move(from: number, delta: number) {
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const idx = (from + delta * step + n * n) % n;
      if (!options[idx].disabled) {
        onChange(options[idx].value);
        refs.current[idx]?.focus();
        return;
      }
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(index, -1);
    }
  }

  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full items-stretch gap-0.5 rounded-control bg-surface-3 p-1 ring-1 ring-inset ring-border",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === activeIndex ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-[background-color,color,box-shadow] duration-150 ease-soft",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-40",
              size === "sm" ? "h-8 px-2.5 text-[13px] pointer-coarse:h-10 [&_svg]:size-3.5" : "h-9 px-3.5 text-sm pointer-coarse:h-11 [&_svg]:size-4",
              fullWidth && "flex-1",
              active
                ? (activeClassName ?? "bg-surface text-brand-800 shadow-sm ring-1 ring-border")
                : "text-slate-600 hover:bg-white/60 hover:text-brand-900",
            )}
          >
            {Icon ? <Icon aria-hidden strokeWidth={2.25} /> : null}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
