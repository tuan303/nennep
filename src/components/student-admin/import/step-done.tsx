"use client";
import { CircleCheck } from "lucide-react";
import { cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { StudentImportResult } from "@/lib/contract";
import { resultTiles } from "../lib/import-wizard";

/** Step 4: commit result. */
export function StepDone({ result, fileName }: { result: StudentImportResult; fileName?: string }) {
  const tiles = resultTiles(result);
  const written = result.created + result.updated + result.transferred + result.reinstated + result.withdrawn;
  return (
    <div className="flex flex-col gap-5">
      <div role="status" className="flex flex-col items-center gap-3 px-2 pt-2 text-center">
        <span className="relative inline-flex size-14 items-center justify-center rounded-2xl bg-ok-soft text-ok-strong ring-1 ring-inset ring-ok/20">
          <CircleCheck aria-hidden className="size-7" strokeWidth={1.9} />
          <span aria-hidden className="absolute -right-1.5 -top-1.5 size-2.5 rotate-45 rounded-[2px] bg-star-400 ring-2 ring-surface" />
        </span>
        <div className="flex max-w-sm flex-col gap-1">
          <p className="text-base font-semibold text-brand-900">{written > 0 ? "Đã cập nhật danh sách học sinh" : "Không có thay đổi nào được ghi"}</p>
          <p className="text-sm leading-relaxed text-slate-500">
            {written > 0 ? `${fmtNumber(written)} học sinh đã được cập nhật` : "Danh sách đã khớp với file"}
            {fileName ? ` từ file “${fileName}”` : ""}. Mọi người dùng sẽ thấy dữ liệu mới ngay.
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.key} className="flex flex-col rounded-xl border border-border bg-surface px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">{t.label}</dt>
            <dd className={cn("num text-[22px] font-bold leading-8", t.count > 0 ? "text-brand-900" : "text-slate-400")}>{fmtNumber(t.count)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
