"use client";
import { Check } from "lucide-react";
import { cn } from "@/components/ui";
import { stepIndex, WIZARD_STEPS, type WizardStep } from "../lib/import-wizard";

/** 1 Tải file · 2 Tùy chọn · 3 Xem trước · 4 Hoàn tất. Labels of other steps are hidden on phones. */
export function WizardStepper({ step }: { step: WizardStep }) {
  const current = stepIndex(step);
  return (
    <ol aria-label="Các bước nhập danh sách" className="flex items-center gap-1.5 sm:gap-2">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < current || step === "done";
        const active = i === current;
        return (
          <li key={s.id} aria-current={active ? "step" : undefined} className={cn("flex min-w-0 items-center gap-1.5 sm:gap-2", active && "flex-1 sm:flex-none")}>
            <span
              className={cn(
                "num inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset",
                done ? "bg-ok text-white ring-ok" : active ? "bg-brand-600 text-white ring-brand-600" : "bg-surface-3 text-slate-500 ring-border",
              )}
            >
              {done ? <Check aria-hidden className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("truncate text-[13px] font-semibold", active ? "text-brand-900" : "text-slate-500 max-sm:sr-only")}>
              {s.label}
              {done ? <span className="sr-only"> (đã xong)</span> : null}
            </span>
            {i < WIZARD_STEPS.length - 1 ? <span aria-hidden className={cn("h-px w-4 shrink-0 sm:w-8", done ? "bg-ok" : "bg-border-strong")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
