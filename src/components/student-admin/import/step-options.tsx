"use client";
import { FileSpreadsheet, ListChecks, RefreshCw } from "lucide-react";
import { DateInput, Field, SegmentedControl } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { ImportMode, ParsedFile } from "../lib/import-wizard";
import { Callout, ChoiceGroup } from "../parts";

export interface StepOptionsProps {
  file: ParsedFile;
  mode: ImportMode;
  effectiveDate: string;
  levelName: string;
  onMode: (mode: ImportMode) => void;
  onDate: (date: string) => void;
}

/** Step 2: upsert vs sync, and the effective date of the changes. */
export function StepOptions({ file, mode, effectiveDate, levelName, onMode, onDate }: StepOptionsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-slate-600 ring-1 ring-inset ring-border">
        <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-ok-strong" strokeWidth={2.25} />
        <span className="min-w-0 truncate">
          <strong className="font-semibold text-slate-800">{file.fileName}</strong> · <span className="num">{fmtNumber(file.rows.length)}</span> học sinh
        </span>
      </div>

      <ChoiceGroup label="Cách cập nhật">
        <SegmentedControl<ImportMode>
          ariaLabel="Cách cập nhật danh sách"
          fullWidth
          value={mode}
          onChange={onMode}
          options={[
            { value: "upsert", label: "Thêm & cập nhật", icon: ListChecks },
            { value: "sync", label: "Đồng bộ toàn bộ", icon: RefreshCw },
          ]}
        />
      </ChoiceGroup>

      {mode === "upsert" ? (
        <Callout tone="brand" title="Thêm & cập nhật">
          Thêm học sinh mới, cập nhật họ tên / ngày sinh / giới tính và chuyển lớp theo file. Học sinh không có trong file được giữ nguyên.
        </Callout>
      ) : (
        <Callout tone="warn" title="Đồng bộ toàn bộ">
          Như “Thêm &amp; cập nhật”, đồng thời liệt kê học sinh đang học của {levelName} nhưng không có trong file. Bạn chọn có đánh dấu các em là Đã chuyển trường hay
          không ở bước sau. Chỉ dùng khi file là danh sách đầy đủ của cả cấp học.
        </Callout>
      )}

      <Field label="Ngày hiệu lực" required hint="Dùng làm ngày nhập học của học sinh mới, ngày chuyển lớp và ngày rời trường (nếu có).">
        <DateInput value={effectiveDate} onChange={onDate} />
      </Field>
    </div>
  );
}
