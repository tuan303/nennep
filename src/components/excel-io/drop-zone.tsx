"use client";
import { useId, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import { Spinner, cn } from "@/components/ui";

export interface DropZoneProps {
  onFile: (file: File) => void;
  busy?: boolean;
  busyText?: string;
  disabled?: boolean;
}

const ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Large tap / drop target for one .xlsx file (keyboard: Tab to the hidden input, Space/Enter opens the picker). */
export function DropZone({ onFile, busy, busyText = "Đang đọc file…", disabled }: DropZoneProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [dragging, setDragging] = useState(false);
  const off = busy || disabled;

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (off) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        if (!off) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-5 py-8 text-center transition-colors duration-150",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500",
        dragging ? "border-brand-500 bg-brand-50" : "border-border-strong bg-surface-2 hover:border-brand-300 hover:bg-brand-50/50",
        off && "cursor-default opacity-80",
      )}
    >
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={off}
        aria-describedby={hintId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      {busy ? (
        <>
          <Spinner size="lg" label={busyText} />
          <span className="text-sm font-semibold text-brand-900" aria-live="polite">
            {busyText}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden className="inline-flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-raised">
            <FileUp className="size-7" strokeWidth={2} />
          </span>
          <span className="text-[15px] font-semibold text-brand-900">
            <span className="hidden sm:inline">Kéo thả file Excel vào đây hoặc </span>
            <span className="text-brand-700 underline decoration-brand-300 underline-offset-4">bấm để chọn file</span>
          </span>
          <span id={hintId} className="max-w-md text-[13px] leading-relaxed text-slate-500">
            File .xlsx: sổ nền nếp cũ (Tiểu học, THCS, THPT) hoặc file đã xuất từ hệ thống. File được đọc ngay trên máy, chưa ghi gì vào hệ thống.
          </span>
        </>
      )}
    </label>
  );
}
