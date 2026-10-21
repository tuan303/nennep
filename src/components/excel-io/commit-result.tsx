"use client";
import Link from "next/link";
import { CircleCheckBig, ListChecks, RotateCcw } from "lucide-react";
import { Button, DataTable, buttonClasses, cn, type DataTableColumn } from "@/components/ui";
import { LEVELS } from "@/lib/constants";
import { fmtNumber } from "@/lib/client/format";
import type { WorkbookCommitResult } from "@/lib/contract";
import type { LevelId } from "@/lib/types";
import { Notice } from "@/components/data-inspect/notice";
import { commitRows, type CommitRow } from "./lib/import-model";

const num = (v: number, tone: string) => <span className={cn("num font-semibold", v === 0 ? "text-slate-300" : tone)}>{fmtNumber(v)}</span>;

const COLUMNS: ReadonlyArray<DataTableColumn<CommitRow>> = [
  { key: "label", header: "Phần dữ liệu", cell: (r) => <span className="font-semibold text-slate-800">{r.label}</span> },
  { key: "created", header: "Tạo mới", align: "right", cell: (r) => num(r.created, "text-ok-strong") },
  { key: "updated", header: "Cập nhật", align: "right", cell: (r) => num(r.updated, "text-brand-800") },
  { key: "skipped", header: "Bỏ qua", align: "right", cell: (r) => num(r.skipped, "text-slate-600") },
];

export interface CommitResultProps {
  result: WorkbookCommitResult;
  levelId: LevelId;
  /** Selected level of the app (the review link switches to `levelId` first when they differ). */
  currentLevel: LevelId;
  onSwitchLevel: (level: LevelId) => void;
  onRestart: () => void;
}

/** Step 4 done: what was written per section, review count, batch id and the link to the review queue. */
export function CommitResult({ result, levelId, currentLevel, onSwitchLevel, onRestart }: CommitResultProps) {
  const rows = commitRows(result);
  const created = rows.reduce((n, r) => n + r.created, 0);
  const updated = rows.reduce((n, r) => n + r.updated, 0);
  const reviewHref = "/du-lieu?mode=all&tab=ra-soat";
  const goReview = () => {
    if (levelId !== currentLevel) onSwitchLevel(levelId);
  };

  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3.5 rounded-card bg-ok-soft px-4 py-4 ring-1 ring-inset ring-ok/20">
        <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ok text-white shadow-raised">
          <CircleCheckBig className="size-6" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-ok-strong">Đã nhập dữ liệu vào cấp {LEVELS[levelId].name}</p>
          <p className="text-sm text-slate-700">
            Tạo mới <strong className="num">{fmtNumber(created)}</strong> · cập nhật <strong className="num">{fmtNumber(updated)}</strong> bản ghi. Thống kê và xếp hạng
            đã được làm mới.
          </p>
          <p className="num mt-1 text-xs text-slate-500">Mã lô nhập: {result.batchId}</p>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-card ring-1 ring-border">
          <DataTable columns={COLUMNS} rows={rows} rowKey={(r) => r.key} dense caption="Kết quả nhập theo phần dữ liệu" />
        </div>
      ) : null}

      {result.review > 0 ? (
        <Notice
          tone="warn"
          title={`${fmtNumber(result.review)} sự việc được nhập ở trạng thái Cần rà soát`}
          action={
            <Link href={reviewHref} onClick={goReview} className={buttonClasses({ variant: "primary", size: "sm" })}>
              <ListChecks aria-hidden className="size-4" strokeWidth={2.25} />
              Xem dữ liệu cần rà soát
            </Link>
          }
        >
          Các sự việc này làm giảm độ tin cậy dữ liệu cho đến khi được bổ sung học sinh hoặc chỉnh sửa.
        </Notice>
      ) : (
        <Link href={reviewHref} onClick={goReview} className={buttonClasses({ variant: "secondary", size: "sm", className: "self-start" })}>
          <ListChecks aria-hidden className="size-4" strokeWidth={2.25} />
          Xem dữ liệu cần rà soát
        </Link>
      )}

      <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onRestart} className="self-start">
        Nhập file khác
      </Button>
    </div>
  );
}
