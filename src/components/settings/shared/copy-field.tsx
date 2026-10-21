"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { copyWithFallback } from "@/components/app/widgets";

export interface CopyFieldProps {
  label: string;
  value: string;
  /** Text actually copied (defaults to `value`). */
  copyValue?: string;
  /** Monospace + large (passwords, ids). */
  emphasis?: boolean;
  className?: string;
}

/** Read-only value with a "Sao chép" button (temporary passwords, batch ids). */
export function CopyField({ label, value, copyValue, emphasis = true, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const ok = await copyWithFallback(copyValue ?? value, {
      success: `Đã sao chép ${label.toLocaleLowerCase("vi")}`,
      title: `Sao chép ${label.toLocaleLowerCase("vi")}`,
    });
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-semibold text-slate-700">{label}</span>
      <div className="flex items-stretch gap-2">
        <output
          className={cn(
            "flex min-h-11 min-w-0 flex-1 select-all items-center overflow-x-auto rounded-control bg-surface-3 px-3 ring-1 ring-inset ring-border-strong",
            emphasis ? "font-mono text-[17px] font-bold tracking-wide text-brand-900" : "text-sm text-slate-800",
          )}
        >
          {value}
        </output>
        <Button variant="secondary" icon={copied ? Check : Copy} onClick={() => void copy()} className="shrink-0">
          {copied ? "Đã chép" : "Sao chép"}
        </Button>
      </div>
    </div>
  );
}
