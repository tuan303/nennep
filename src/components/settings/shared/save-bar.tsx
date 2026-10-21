"use client";
import { CircleAlert, RotateCcw, Save } from "lucide-react";
import { Button, cn } from "@/components/ui";

export interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  /** "2 lỗi mới · 1 lỗi sửa" – what will be saved. */
  summary?: string;
  /** Number of invalid fields (save is still clickable: it focuses the first error). */
  errorCount?: number;
  onSave: () => void;
  onReset: () => void;
  saveLabel?: string;
  className?: string;
}

/**
 * Sticky footer of an editor: unsaved summary + "Hoàn tác" + "Lưu thay đổi".
 * Sits above the phone bottom tab bar; hidden when there is nothing to save; never printed.
 */
export function SaveBar({ dirty, saving, summary, errorCount = 0, onSave, onReset, saveLabel = "Lưu thay đổi", className }: SaveBarProps) {
  if (!dirty && !saving) return null;
  return (
    <div data-print-hide className={cn("sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-1 animate-slide-up md:bottom-4", className)}>
      <div className="flex flex-col gap-3 rounded-card bg-brand-900 px-4 py-3 text-white shadow-pop ring-1 ring-brand-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-star-400" />
            Có thay đổi chưa lưu
          </p>
          {errorCount > 0 ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-star-200">
              <CircleAlert aria-hidden className="size-3.5" strokeWidth={2.5} />
              Còn {errorCount} ô cần sửa trước khi lưu
            </p>
          ) : summary ? (
            <p className="mt-0.5 truncate text-[13px] text-brand-200">{summary}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button
            variant="ghost"
            icon={RotateCcw}
            onClick={onReset}
            disabled={saving}
            className="text-white hover:bg-white/10 hover:text-white active:bg-white/15"
          >
            Hoàn tác
          </Button>
          <Button variant="gold" icon={Save} onClick={onSave} loading={saving}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
