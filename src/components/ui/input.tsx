"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { CalendarDays, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { controlBase, controlHeight } from "./control-styles";
import { useFieldControl } from "./field";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "md" | "lg";
  /** Leading icon. */
  icon?: LucideIcon;
  /** Trailing content inside the box, e.g. "điểm" or a clear button. */
  suffix?: ReactNode;
  invalid?: boolean;
  /** Class for the outer wrapper (width, margins). `className` styles the <input>. */
  wrapperClassName?: string;
}

/** Text input. Inside <Field> it receives id / aria-describedby / aria-invalid automatically. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", icon: Icon, suffix, invalid, className, wrapperClassName, type = "text", ...rest },
  ref,
) {
  const a11y = useFieldControl({ ...rest, invalid });
  return (
    <div className={cn("relative flex min-w-0 items-center", wrapperClassName)}>
      {Icon ? (
        <Icon aria-hidden className="pointer-events-none absolute left-3 size-[18px] text-slate-400" strokeWidth={2} />
      ) : null}
      <input
        ref={ref}
        type={type}
        {...rest}
        {...a11y}
        className={cn(controlBase, controlHeight[size], "px-3", Icon && "pl-10", suffix != null && "pr-12", className)}
      />
      {suffix != null ? (
        <span className="absolute right-1.5 flex items-center gap-1 text-[13px] text-slate-500 [&:not(:has(button))]:pointer-events-none [&:not(:has(button))]:pr-1.5">
          {suffix}
        </span>
      ) : null}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Grows with content (CSS field-sizing where supported). Default true. */
  autoGrow?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoGrow = true, rows = 3, className, ...rest },
  ref,
) {
  const a11y = useFieldControl({ ...rest, invalid });
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...rest}
      {...a11y}
      className={cn(controlBase, "min-h-24 resize-y px-3 py-2.5 leading-relaxed", autoGrow && "field-sizing-content max-h-80", className)}
    />
  );
});

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value" | "onChange"> {
  /** "yyyy-mm-dd" or "" */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  size?: "md" | "lg";
  invalid?: boolean;
  wrapperClassName?: string;
}

/** Native date picker (best on phones) styled like Input. Value is "yyyy-mm-dd". */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onChange, size = "md", invalid, className, wrapperClassName, ...rest },
  ref,
) {
  const a11y = useFieldControl({ ...rest, invalid });
  return (
    <div className={cn("relative flex min-w-0 items-center", wrapperClassName)}>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
        {...a11y}
        className={cn(
          controlBase,
          controlHeight[size],
          "num appearance-none pl-3 pr-10 text-left [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-y-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-10 [&::-webkit-date-and-time-value]:text-left",
          !value && "text-slate-400",
          className,
        )}
      />
      <CalendarDays aria-hidden className="pointer-events-none absolute right-3 size-[18px] text-slate-500" strokeWidth={2} />
    </div>
  );
});
