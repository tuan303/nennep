"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "./cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "md";
  /** Accessible name when there is no visible label. */
  "aria-label"?: string;
  className?: string;
}

/** On/off switch (role="switch"). The whole row is clickable when a label is given. */
export function Switch({ checked, onChange, label, description, disabled, id, size = "md", "aria-label": ariaLabel, className }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? `sw${autoId}`;
  const descId = description ? `${switchId}-desc` : undefined;
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const thumb = size === "sm" ? "size-4 data-[on=true]:translate-x-4" : "size-5 data-[on=true]:translate-x-5";
  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={descId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-soft",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
        "before:absolute before:-inset-2.5 before:content-['']",
        checked ? "bg-brand-600" : "bg-slate-300 hover:bg-slate-400",
        track,
      )}
    >
      <span
        aria-hidden
        data-on={checked}
        className={cn("block rounded-full bg-white shadow-[0_1px_3px_rgb(11_31_77/0.3)] transition-transform duration-200 ease-soft", thumb)}
      />
    </button>
  );
  if (!label && !description) return <span className={className}>{control}</span>;
  return (
    <div className={cn("flex min-h-11 items-start justify-between gap-4 py-1", className)}>
      <div className="min-w-0 pt-0.5">
        {label ? (
          <label htmlFor={switchId} className={cn("text-sm font-semibold text-slate-800", disabled && "opacity-60")}>
            {label}
          </label>
        ) : null}
        {description ? (
          <p id={descId} className="text-[13px] leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      <span className="pt-0.5">{control}</span>
    </div>
  );
}

export interface CheckboxProps {
  checked: boolean | "indeterminate";
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  value?: string;
  "aria-label"?: string;
  className?: string;
}

/** Native checkbox with a custom look; supports the indeterminate state. */
export function Checkbox({ checked, onChange, label, description, disabled, id, name, value, "aria-label": ariaLabel, className }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const boxId = id ?? `cb${autoId}`;
  const descId = description ? `${boxId}-desc` : undefined;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = checked === "indeterminate";
  }, [checked]);

  const box = (
    <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
      <input
        ref={ref}
        id={boxId}
        type="checkbox"
        name={name}
        value={value}
        checked={checked === true}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={descId}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          "peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-md border-[1.5px] border-border-strong bg-surface shadow-xs transition-colors duration-150",
          "hover:border-brand-400 checked:border-brand-600 checked:bg-brand-600 indeterminate:border-brand-600 indeterminate:bg-brand-600",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <Check aria-hidden strokeWidth={3.25} className="pointer-events-none relative size-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
      <Minus aria-hidden strokeWidth={3.25} className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-indeterminate:opacity-100" />
    </span>
  );

  if (!label && !description) return <span className={cn("inline-flex", className)}>{box}</span>;
  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-2.5 pointer-fine:min-h-0 pointer-fine:py-1", className)}>
      <span className="pt-px">{box}</span>
      <div className="min-w-0">
        {label ? (
          <label htmlFor={boxId} className={cn("text-sm font-medium leading-5 text-slate-800", disabled && "opacity-60")}>
            {label}
          </label>
        ) : null}
        {description ? (
          <p id={descId} className="text-[13px] leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
