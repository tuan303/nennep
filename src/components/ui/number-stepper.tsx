"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "./cn";
import { useFieldControl } from "./field";
import { clampStep } from "./math";

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: "md" | "lg";
  disabled?: boolean;
  invalid?: boolean;
  /** Unit after the number, e.g. "HS", "lần". */
  suffix?: string;
  id?: string;
  /** Accessible name when not inside a labelled <Field>. */
  "aria-label"?: string;
  className?: string;
}

/** Big −/+ buttons around a numeric field (touch friendly, ≥44px). Typing is allowed; the value is clamped on blur. */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  size = "md",
  disabled,
  invalid,
  suffix,
  id,
  "aria-label": ariaLabel,
  className,
}: NumberStepperProps) {
  const a11y = useFieldControl({ id, invalid });
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const set = (n: number) => {
    const v = clampStep(n, min, max, step);
    setDraft(String(v));
    if (v !== value) onChange(v);
  };

  const btn = cn(
    "inline-flex shrink-0 items-center justify-center rounded-[9px] text-brand-700 transition-[background-color,transform] duration-150",
    "hover:bg-brand-50 active:scale-95 active:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:text-slate-300",
    size === "lg" ? "size-12" : "size-11",
  );

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-control border border-border-strong bg-surface p-0.5 shadow-xs transition-[border-color,box-shadow]",
        "focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15",
        a11y["aria-invalid"] && "border-bad",
        disabled && "bg-surface-3 opacity-60",
        className,
      )}
    >
      <button type="button" className={btn} aria-label="Giảm" disabled={disabled || value <= min} onClick={() => set(value - step)}>
        <Minus aria-hidden className="size-5" strokeWidth={2.5} />
      </button>
      <div className="flex min-w-14 flex-1 items-baseline justify-center gap-1">
        <input
          {...a11y}
          aria-label={ariaLabel}
          type="text"
          inputMode={step >= 1 ? "numeric" : "decimal"}
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
          aria-valuenow={value}
          disabled={disabled}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,-]/g, ""))}
          onBlur={() => set(Number(draft.replace(",", ".")))}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              set(value + step);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              set(value - step);
            } else if (e.key === "Enter") {
              set(Number(draft.replace(",", ".")));
            }
          }}
          className={cn(
            "num w-full min-w-0 bg-transparent text-center font-bold text-brand-900 outline-none",
            size === "lg" ? "text-2xl" : "text-xl",
            suffix ? "max-w-[4ch]" : "",
          )}
        />
        {suffix ? <span className="text-[13px] font-medium text-slate-500">{suffix}</span> : null}
      </div>
      <button type="button" className={btn} aria-label="Tăng" disabled={disabled || value >= max} onClick={() => set(value + step)}>
        <Plus aria-hidden className="size-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
