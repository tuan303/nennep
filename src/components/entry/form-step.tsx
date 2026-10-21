"use client";
import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/components/ui";

export interface FormStepProps {
  /** Step number shown in the round badge. */
  n: number;
  title: ReactNode;
  description?: ReactNode;
  /** Right side of the step header (e.g. a small counter). */
  aside?: ReactNode;
  /** Shows a green check instead of the number. */
  done?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Numbered section of a long form: number badge + title, content indented under the title on tablets and up. */
export function FormStep({ n, title, description, aside, done, id, className, children }: FormStepProps) {
  const autoId = useId();
  const headingId = `${id ?? autoId}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("flex scroll-mt-24 flex-col gap-3 border-t border-border px-4 py-5 first:border-t-0 sm:px-5", className)}>
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "num inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors",
            done ? "bg-ok text-white" : "bg-brand-600 text-white shadow-press",
          )}
        >
          {done ? <Check className="size-4" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 id={headingId} className="text-[15px] font-semibold leading-6 text-brand-900">
            <span className="sr-only">Bước {n}: </span>
            {title}
          </h3>
          {description ? <p className="text-[13px] leading-5 text-slate-500">{description}</p> : null}
        </div>
        {aside ? <div className="shrink-0 pt-1 text-xs text-slate-500">{aside}</div> : null}
      </header>
      <div className="flex min-w-0 flex-col gap-4 sm:pl-10">{children}</div>
    </section>
  );
}
