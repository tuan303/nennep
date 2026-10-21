"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "./cn";

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

interface ControlA11yProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  required?: boolean;
}

/** Merge a control's own a11y props with the enclosing <Field> (id, aria-describedby, aria-invalid, required). */
export function useFieldControl<P extends ControlA11yProps>(props: P & { invalid?: boolean }): ControlA11yProps {
  const ctx = useContext(FieldContext);
  const invalid = props.invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true" || ctx?.invalid || false;
  const describedBy = [props["aria-describedby"], ctx?.describedBy].filter(Boolean).join(" ") || undefined;
  return {
    id: props.id ?? ctx?.id,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    required: props.required ?? (ctx?.required || undefined),
  };
}

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  /** Error message (marks the control aria-invalid and shows in red). */
  error?: ReactNode;
  required?: boolean;
  /** Id of the control. If omitted an id is generated and passed to kit controls via context. */
  htmlFor?: string;
  /** Right side of the label row (e.g. a small "Xóa" link or a counter). */
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error. Kit controls inside pick up id / aria-describedby automatically. */
export function Field({ label, hint, error, required, htmlFor, labelAside, className, children }: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? `f${autoId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const value: FieldContextValue = {
    id,
    describedBy: [errorId, hintId].filter(Boolean).join(" ") || undefined,
    invalid: !!error,
    required: !!required,
  };
  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        {label != null || labelAside != null ? (
          <div className="flex items-baseline justify-between gap-3">
            {label != null ? (
              <label htmlFor={id} className="text-[13.5px] font-semibold leading-5 text-slate-800">
                {label}
                {required ? (
                  <span className="ml-0.5 text-bad" aria-hidden>
                    *
                  </span>
                ) : null}
                {required ? <span className="sr-only"> (bắt buộc)</span> : null}
              </label>
            ) : (
              <span />
            )}
            {labelAside != null ? <div className="shrink-0 text-xs text-slate-500">{labelAside}</div> : null}
          </div>
        ) : null}
        {children}
        {error ? (
          <p id={errorId} className="flex items-start gap-1.5 text-[13px] font-medium leading-5 text-bad-strong">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
            <span>{error}</span>
          </p>
        ) : null}
        {hint ? (
          <p id={hintId} className="text-xs leading-5 text-slate-500">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
