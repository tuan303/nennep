"use client";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ui";
import { removedWeeksText, type HiddenRecordsConflict } from "../lib/calendar-conflict";

interface Pending {
  conflict: HiddenRecordsConflict;
  /** Repeats the refused request with `allowHidingRecords` (rejects → the dialog stays open). */
  confirm: () => Promise<void>;
}

/**
 * Confirmation for a calendar change the server refused because removed weeks still hold records (409): shows the
 * server's explanation and, on "Vẫn lưu", repeats the same request with `allowHidingRecords`.
 * Usage: `const hiding = useHidingRecordsConfirm(); … if (conflict) hiding.ask(conflict, () => save(true)); … {hiding.dialog}`
 */
export function useHidingRecordsConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = useCallback((conflict: HiddenRecordsConflict, confirm: () => Promise<void>) => setPending({ conflict, confirm }), []);
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      tone="danger"
      title="Bỏ các tuần còn dữ liệu khỏi lịch?"
      message={pending?.conflict.message}
      confirmLabel="Vẫn lưu và ẩn các bản ghi này"
      onConfirm={async () => {
        if (pending) await pending.confirm();
      }}
    >
      {pending ? (
        <p className="num rounded-control bg-surface-2 px-3 py-2 text-[13px] text-slate-600 ring-1 ring-inset ring-border">
          Tuần bị bỏ – {removedWeeksText(pending.conflict.weeks)}. Các bản ghi vẫn được lưu và hiện lại nếu thêm lại tuần đó vào lịch.
        </p>
      ) : null}
    </ConfirmDialog>
  );
  return { ask, dialog };
}
