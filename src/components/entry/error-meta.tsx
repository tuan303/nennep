"use client";
import { Calculator, FolderTree, Layers, Lock, Ruler } from "lucide-react";
import { unitExplanation } from "@/components/app/widgets";
import { Pill } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { CatalogItem } from "@/lib/types";

export interface ErrorMetaProps {
  item: CatalogItem;
  /** The values come from the record's stored snapshot (edit mode, unchanged error). */
  fromSnapshot?: boolean;
}

/** Read-only catalog metadata of the chosen error (FR-ENT-003): Mảng, Nhóm, Mức trừ, Đơn vị. */
export function ErrorMeta({ item, fromSnapshot }: ErrorMetaProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ul aria-label="Thông tin lỗi (tự động theo bảng điểm lỗi)" className="flex min-w-0 flex-wrap gap-1.5">
        <li className="min-w-0 max-w-full">
          <Pill icon={Layers} title={item.category}>
            <span className="text-slate-500">Mảng:</span> <strong className="font-semibold text-slate-800">{item.category}</strong>
          </Pill>
        </li>
        {item.group ? (
          <li>
            <Pill icon={FolderTree}>
              <span className="text-slate-500">Nhóm:</span> <strong className="font-semibold text-slate-800">{item.group}</strong>
            </Pill>
          </li>
        ) : null}
        <li>
          <Pill icon={Calculator}>
            <span className="text-slate-500">Mức trừ:</span> <strong className="num font-semibold text-slate-800">{fmtNumber(item.penalty)} điểm</strong>
          </Pill>
        </li>
        <li>
          <Pill icon={Ruler} title={unitExplanation(item.unit)}>
            <span className="text-slate-500">Đơn vị:</span>{" "}
            <strong className="font-semibold text-slate-800">{item.unit === "/HS" ? "/HS – theo số học sinh" : "/lần – theo số lần"}</strong>
          </Pill>
        </li>
      </ul>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Lock aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
        {fromSnapshot
          ? "Giữ nguyên theo bảng điểm lỗi tại thời điểm ghi nhận – không sửa tay."
          : `Mã ${item.code} · tự động theo bảng điểm lỗi – không sửa tay.`}
      </p>
    </div>
  );
}
