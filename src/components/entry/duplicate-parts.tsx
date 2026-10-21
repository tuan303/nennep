"use client";
/** "Có thể trùng" notice under the form and the confirm dialog shown on save (REQ_V2 §7.1). */
import { Copy, Eye } from "lucide-react";
import { ScopeBadge } from "@/components/app/widgets";
import { Button, ConfirmDialog, StatusBadge } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { Incident } from "@/lib/types";
import { duplicateNoticeText, recordedAtText, recorderOf } from "./lib/duplicates";
import { subjectSummary } from "./lib/recent";
import type { RosterNames } from "./lib/student-names";

export interface DuplicateNoticeProps {
  duplicates: readonly Incident[];
  today: string;
  roster?: RosterNames;
  onOpen: (incident: Incident) => void;
}

/** Live, non-blocking warning while date + lớp + lỗi (+ học sinh) match a recorded incident. */
export function DuplicateNotice({ duplicates, today, roster, onOpen }: DuplicateNoticeProps) {
  if (duplicates.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-control bg-warn-soft px-3.5 py-3 text-warn-strong ring-1 ring-inset ring-warn/40">
      <p className="flex items-start gap-2 text-[13.5px] font-semibold leading-5">
        <Copy aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
        <span className="min-w-0 break-words">{duplicateNoticeText(duplicates, today, roster)}</span>
      </p>
      <p className="pl-6 text-[13px] leading-5 text-slate-700">
        Kiểm tra trước khi lưu để không tính điểm trừ hai lần. Nếu đây là sự việc khác, vẫn có thể lưu bình thường.
      </p>
      <div className="flex flex-wrap gap-1.5 pl-6">
        {duplicates.slice(0, 3).map((i) => (
          <Button key={i.id} size="sm" variant="outline" icon={Eye} onClick={() => onOpen(i)} className="bg-surface">
            Xem {i.code}
          </Button>
        ))}
      </div>
    </div>
  );
}

export interface DuplicateConfirmDialogProps {
  /** Matches found at save time; null closes the dialog. */
  duplicates: readonly Incident[] | null;
  /** Editing an existing record (no `notDuplicateOf` is sent, the save just goes ahead). */
  editing: boolean;
  today: string;
  roster?: RosterNames;
  onConfirm: () => void;
  onCancel: () => void;
  /** Opens a match in the detail sheet (the dialog closes first). */
  onOpen: (incident: Incident) => void;
}

/** "Có thể trùng sự việc đã ghi": list of matches with "Xem", and "Không trùng, vẫn lưu" / "Hủy". */
export function DuplicateConfirmDialog({ duplicates, editing, today, roster, onConfirm, onCancel, onOpen }: DuplicateConfirmDialogProps) {
  const list = duplicates ?? [];
  return (
    <ConfirmDialog
      open={duplicates !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      tone="primary"
      title="Có thể trùng sự việc đã ghi"
      message={
        editing
          ? "Sự việc sau khi sửa trùng ngày, lớp, lỗi và học sinh với sự việc dưới đây. Nếu đây là hai sự việc khác nhau, chọn “Không trùng, vẫn lưu”."
          : "Đã có sự việc cùng ngày, lớp, lỗi và học sinh. Lưu thêm có thể làm điểm trừ bị tính hai lần. Nếu đây là sự việc khác, chọn “Không trùng, vẫn lưu”."
      }
      confirmLabel="Không trùng, vẫn lưu"
      cancelLabel="Hủy"
      onConfirm={onConfirm}
    >
      <ul className="flex max-h-[45vh] flex-col divide-y divide-border overflow-y-auto rounded-card border border-border bg-surface">
        {list.map((i) => (
          <li key={i.id} className="flex items-start gap-3 px-3 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className="num font-semibold text-brand-900">{i.code}</span>
                <span className="num text-slate-500">{recordedAtText(i, today)}</span>
              </p>
              <p className="text-sm text-slate-800">
                <span className="num mr-1.5 font-semibold text-slate-500">{i.errorCode}</span>
                {i.issue}
              </p>
              <p className="truncate text-[13px] text-slate-600">
                {subjectSummary(i, 3, roster)} · Người ghi: {recorderOf(i)}
              </p>
              <p className="flex flex-wrap items-center gap-1.5">
                <ScopeBadge scope={i.scope} size="sm" />
                <StatusBadge status={i.status} size="sm" />
                <span className="num text-[13px] font-bold text-bad-strong">−{fmtNumber(i.points)} điểm</span>
              </p>
            </div>
            <Button size="sm" variant="ghost" icon={Eye} onClick={() => onOpen(i)} className="shrink-0" aria-label={`Xem sự việc ${i.code}`}>
              <span className="max-sm:sr-only">Xem</span>
            </Button>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
