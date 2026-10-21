"use client";
import type { ReactNode } from "react";
import { CircleAlert, ImageOff, ListPlus, Save, Undo2, Upload } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { EntryPreview } from "./lib/preview";

export type SaveMode = "save" | "next" | "update";

export interface EntryActionBarProps {
  mode: "create" | "edit";
  preview: EntryPreview;
  /** Which button is running (null = idle). */
  saving: SaveMode | null;
  /** Photos are still uploading. */
  uploading: boolean;
  /** Why the evidence photos block saving (uploads in progress or failed – see photoSaveBlocker). */
  photoBlocker?: string;
  onSave: () => void;
  onSaveNext: () => void;
  onCancelEdit: () => void;
  /** Id of the preview step (the "why can't I save" link scrolls there). */
  previewId: string;
}

/**
 * Sticky bottom action bar: floats above the phone tab bar (and its gold "+" button) with safe-area insets,
 * shows the points or the first blocking reason, and the save buttons.
 */
export function EntryActionBar({ mode, preview, saving, uploading, photoBlocker, onSave, onSaveNext, onCancelEdit, previewId }: EntryActionBarProps) {
  const busy = saving !== null || uploading;
  const blocked = !preview.canSave;
  const failedPhotos = !uploading && !!photoBlocker;
  const disabled = busy || blocked || failedPhotos;

  let status: ReactNode;
  if (uploading) {
    status = (
      <span className="inline-flex items-center gap-1.5 text-brand-700">
        <Upload aria-hidden className="size-3.5" strokeWidth={2.5} />
        Đang tải ảnh minh chứng lên…
      </span>
    );
  } else if (failedPhotos) {
    status = (
      <span className="flex min-w-0 items-center gap-1.5 text-bad-strong">
        <ImageOff aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
        <span className="min-w-0 truncate">Chưa thể lưu: {photoBlocker}</span>
      </span>
    );
  } else if (blocked) {
    const more = preview.issues.length - 1;
    status = (
      <button
        type="button"
        onClick={() => document.getElementById(previewId)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="flex w-full min-w-0 max-w-full items-center gap-1.5 rounded text-left text-warn-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <CircleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
        <span className="min-w-0 truncate">
          Chưa thể lưu: {preview.issues[0]}
          {more > 0 ? ` (+${more})` : ""}
        </span>
      </button>
    );
  } else {
    status = (
      <span className="num text-slate-600">
        <strong className="text-base font-extrabold text-brand-900">{fmtNumber(preview.points)}</strong> điểm trừ
        {preview.relatedCount > 0 ? ` · ${fmtNumber(preview.relatedCount)} HS` : ""}
        <span className="ml-2 hidden text-xs text-slate-400 pointer-fine:inline">Ctrl + Enter để lưu</span>
      </span>
    );
  }

  return (
    <div
      data-print-hide
      className={cn(
        "sticky z-20 mt-3 rounded-2xl border border-border bg-surface/95 p-2.5 shadow-pop backdrop-blur supports-[backdrop-filter]:bg-surface/85",
        "bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-4",
        "pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))]",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 px-1 text-[13px]" aria-live="polite">
          {status}
        </div>
        <div className="flex min-w-0 shrink-0 gap-2">
          {mode === "edit" ? (
            <>
              <Button variant="secondary" icon={Undo2} onClick={onCancelEdit} disabled={saving !== null} className="flex-1 sm:flex-none">
                Hủy sửa
              </Button>
              <Button icon={Save} onClick={onSave} loading={saving === "update"} disabled={disabled} className="flex-1 sm:flex-none">
                Cập nhật
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" icon={ListPlus} onClick={onSaveNext} loading={saving === "next"} disabled={disabled} className="flex-1 sm:flex-none">
                Lưu &amp; nhập tiếp
              </Button>
              <Button icon={Save} onClick={onSave} loading={saving === "save"} disabled={disabled} className="flex-1 sm:flex-none">
                Lưu
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
