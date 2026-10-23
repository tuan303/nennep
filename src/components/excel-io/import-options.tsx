"use client";
import { ScanSearch } from "lucide-react";
import { Button, Checkbox, cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { Notice } from "@/components/data-inspect/notice";
import { MAX_REQUEST_BYTES, OPTION_DEFS, anySelected, formatBytes, optionCount, type ImportOptions, type SectionKey } from "./lib/import-model";

export interface ImportOptionsPanelProps {
  options: ImportOptions;
  onChange: (next: ImportOptions) => void;
  counts: Record<SectionKey, number>;
  /** Size of the request that "Kiểm tra trước" would send. */
  requestBytes: number;
  /** "Ghi đè thay đổi trong phần mềm" (top-level `overwriteAppChanges` of preview and commit). */
  overwriteAppChanges: boolean;
  onOverwriteChange: (next: boolean) => void;
  /** "Tính lại sự việc đã ghi theo bảng điểm mới" (top-level `rescoreExisting` of preview and commit). */
  rescoreExisting: boolean;
  onRescoreChange: (next: boolean) => void;
  onPreview: () => void;
  previewing: boolean;
  disabled?: boolean;
}

/** Step 2: which sections to import (WorkbookImportOptions) and the "Kiểm tra trước" action. */
export function ImportOptionsPanel({
  options,
  onChange,
  counts,
  requestBytes,
  overwriteAppChanges,
  onOverwriteChange,
  rescoreExisting,
  onRescoreChange,
  onPreview,
  previewing,
  disabled,
}: ImportOptionsPanelProps) {
  const tooLarge = requestBytes > MAX_REQUEST_BYTES;
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPTION_DEFS.map((def) => {
          const n = optionCount(def, counts);
          const empty = n === 0;
          return (
            <li
              key={def.key}
              className={cn(
                "rounded-control px-3 py-2.5 ring-1 ring-inset transition-colors",
                options[def.key] ? (def.danger ? "bg-warn-soft/60 ring-warn/30" : "bg-brand-50/60 ring-brand-600/15") : "bg-surface ring-border",
              )}
            >
              <Checkbox
                checked={options[def.key] && !empty}
                onChange={(v) => onChange({ ...options, [def.key]: v })}
                disabled={disabled || previewing || empty}
                label={
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-slate-800">{def.label}</span>
                    {def.key === "config" ? null : <span className="num text-xs text-slate-500">{empty ? "không có dữ liệu" : `${fmtNumber(n)} dòng`}</span>}
                  </span>
                }
                description={def.key === "config" && empty ? "File không có trang Cấu hình." : def.description}
              />
            </li>
          );
        })}
      </ul>

      <div className={cn("rounded-control px-3 py-2.5 ring-1 ring-inset transition-colors", overwriteAppChanges ? "bg-warn-soft/60 ring-warn/30" : "bg-surface ring-border")}>
        <Checkbox
          checked={overwriteAppChanges}
          onChange={onOverwriteChange}
          disabled={disabled || previewing}
          label={<span className="font-semibold text-slate-800">Ghi đè thay đổi trong phần mềm</span>}
          description="Mặc định, sự việc / điểm thưởng / học sinh đã được sửa trong phần mềm sau lần nhập trước (phản hồi GVCN, sửa khi rà soát, chuyển lớp…) được giữ nguyên và dòng tương ứng chỉ báo Cảnh báo; mã trùng nhưng khác lớp / khác lỗi bị báo Lỗi. Chỉ chọn khi file là bản đúng nhất."
        />
      </div>

      <div className={cn("rounded-control px-3 py-2.5 ring-1 ring-inset transition-colors", rescoreExisting ? "bg-warn-soft/60 ring-warn/30" : "bg-surface ring-border")}>
        <Checkbox
          checked={rescoreExisting}
          onChange={onRescoreChange}
          disabled={disabled || previewing || !options.incidents}
          label={<span className="font-semibold text-slate-800">Tính lại sự việc đã ghi theo bảng điểm mới</span>}
          description="Mặc định, sự việc đã có trong hệ thống giữ mức trừ và đơn vị (/HS, /lần) lúc ghi nhận. Chọn khi nhà trường đổi cách tính một lỗi và muốn áp dụng cho cả các sự việc cũ có trong file. Sự việc nhập hoặc sửa trong phần mềm chỉ được tính lại khi chọn cả “Ghi đè thay đổi trong phần mềm”."
        />
      </div>

      {rescoreExisting && options.incidents ? (
        <Notice tone="warn" role="alert" title="Điểm các tuần trước có thể thay đổi">
          Các sự việc đã ghi có trong file được tính lại theo mức trừ và đơn vị trong bảng điểm lỗi hiện tại{options.catalog ? " (bảng trong file)" : ""}; xếp hạng các tuần trước có thể thay đổi.
          {overwriteAppChanges ? "" : " Sự việc nhập hoặc sửa trong phần mềm được giữ nguyên (cần chọn thêm “Ghi đè thay đổi trong phần mềm”)."}
        </Notice>
      ) : null}

      {overwriteAppChanges ? (
        <Notice tone="warn" role="alert" title="Sẽ ghi đè thay đổi đã làm trong phần mềm">
          Nội dung trong file sẽ thay thế các chỉnh sửa đã làm trực tiếp trong phần mềm kể từ lần nhập trước (kể cả phản hồi và trạng thái do GVCN cập nhật).
        </Notice>
      ) : null}

      {options.config ? (
        <Notice tone="warn" role="alert" title="Sẽ ghi đè cấu hình đã phê duyệt">
          Điểm nền mỗi tuần, tuần bắt đầu và ngày học kỳ của cấp học sẽ được thay bằng giá trị trong file. Chỉ chọn khi chắc chắn file là bản cấu hình mới nhất.
        </Notice>
      ) : null}

      {tooLarge ? (
        <Notice tone="bad" role="alert" title="File quá lớn để gửi một lần">
          Dữ liệu chọn nhập khoảng {formatBytes(requestBytes)} (tối đa {formatBytes(MAX_REQUEST_BYTES)}). Hãy tách danh sách học sinh để nhập riêng ở Quản lý học sinh
          {options.students ? (
            <>
              {" – "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-brand-500"
                onClick={() => onChange({ ...options, students: false })}
              >
                bỏ chọn Học sinh
              </button>
            </>
          ) : null}
          .
        </Notice>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="num text-xs text-slate-500">
          Dung lượng gửi kiểm tra: {formatBytes(requestBytes)} · Bước này chưa ghi dữ liệu.
        </p>
        <Button variant="primary" icon={ScanSearch} loading={previewing} disabled={disabled || tooLarge || !anySelected(options)} onClick={onPreview}>
          {previewing ? "Đang kiểm tra…" : "Kiểm tra trước"}
        </Button>
      </div>
    </div>
  );
}
