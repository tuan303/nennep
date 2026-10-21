import { Check } from "lucide-react";
import { cn } from "@/components/ui";

export const IMPORT_STEPS = ["Tải file", "Chọn dữ liệu", "Kiểm tra trước", "Xác nhận nhập"] as const;

/** Horizontal step indicator (numbers on phones, labels from 640px). `done` marks every step complete. */
export function WizardSteps({ current, done }: { current: number; done?: boolean }) {
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Các bước nhập dữ liệu">
      {IMPORT_STEPS.map((label, i) => {
        const complete = done || i < current;
        const active = !done && i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "num inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset",
                complete && "bg-ok text-white ring-ok-strong/40",
                active && "bg-brand-600 text-white ring-brand-700/40 shadow-raised",
                !complete && !active && "bg-surface-3 text-slate-500 ring-border",
              )}
            >
              {complete ? <Check aria-hidden className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("hidden truncate text-[13px] font-semibold sm:inline", active ? "text-brand-900" : complete ? "text-ok-strong" : "text-slate-500")}>
              {label}
            </span>
            <span className="sr-only sm:hidden">{`${label}${complete ? " – xong" : active ? " – đang thực hiện" : ""}`}</span>
            {i < IMPORT_STEPS.length - 1 ? <span aria-hidden className={cn("h-0.5 min-w-3 flex-1 rounded-full", complete ? "bg-ok/60" : "bg-border")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
