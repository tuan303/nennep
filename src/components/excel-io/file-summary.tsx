"use client";
import { ArrowLeftRight, ChevronRight, FileSpreadsheet, FileWarning, Layers, RotateCcw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { LEVELS } from "@/lib/constants";
import { fmtNumber } from "@/lib/client/format";
import type { WorkbookPayload } from "@/lib/contract";
import type { LevelId } from "@/lib/types";
import { Notice } from "@/components/data-inspect/notice";
import { SECTION_LABELS, SECTION_ORDER, formatBytes, type SectionKey } from "./lib/import-model";

export interface ParsedFile {
  fileName: string;
  size: number;
  payload: WorkbookPayload;
  warnings: string[];
}

export interface FileSummaryProps {
  file: ParsedFile;
  counts: Record<SectionKey, number>;
  currentLevel: LevelId;
  accessibleLevels: LevelId[];
  onSwitchLevel: (level: LevelId) => void;
  onReset: () => void;
  disabled?: boolean;
}

const MAX_WARNINGS = 200;

/** Parsed file: name, detected level (with a switch when it differs), rows per section and parse warnings. */
export function FileSummary({ file, counts, currentLevel, accessibleLevels, onSwitchLevel, onReset, disabled }: FileSummaryProps) {
  const level = file.payload.levelId;
  const allowed = accessibleLevels.includes(level);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-control bg-surface-2 px-3.5 py-3 ring-1 ring-inset ring-border">
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok-strong ring-1 ring-inset ring-ok/20">
          <FileSpreadsheet className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-brand-900" title={file.fileName}>
            {file.fileName}
          </p>
          <p className="num text-xs text-slate-500">{formatBytes(file.size)}</p>
        </div>
        <Badge tone="brand" icon={Layers}>
          Cấp {LEVELS[level].short}
        </Badge>
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReset} disabled={disabled}>
          Chọn file khác
        </Button>
      </div>

      {!allowed ? (
        <Notice tone="bad" role="alert" title={`Tài khoản không có quyền với cấp ${LEVELS[level].name}`}>
          File này thuộc cấp {LEVELS[level].short}. Vui lòng liên hệ quản trị viên hoặc chọn file của cấp học khác.
        </Notice>
      ) : level !== currentLevel ? (
        <Notice
          tone="warn"
          title={`File thuộc cấp ${LEVELS[level].name}, đang xem cấp ${LEVELS[currentLevel].name}`}
          action={
            <Button variant="secondary" size="sm" icon={ArrowLeftRight} onClick={() => onSwitchLevel(level)} disabled={disabled}>
              Chuyển sang cấp {LEVELS[level].short}
            </Button>
          }
        >
          Dữ liệu sẽ được nhập vào cấp {LEVELS[level].short}. Nên chuyển sang cấp này để đối chiếu sau khi nhập.
        </Notice>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SECTION_ORDER.map((key) => (
          <div key={key} className="flex flex-col-reverse rounded-control bg-surface px-3 py-2 ring-1 ring-inset ring-border">
            <dt className="truncate text-xs text-slate-500">{SECTION_LABELS[key]}</dt>
            <dd className={`num text-lg font-bold ${counts[key] > 0 ? "text-brand-900" : "text-slate-300"}`}>
              {key === "config" ? (counts.config > 0 ? "Có" : "–") : fmtNumber(counts[key])}
            </dd>
          </div>
        ))}
      </dl>

      {file.warnings.length > 0 ? (
        <details className="group rounded-control bg-warn-soft/60 ring-1 ring-inset ring-warn/25">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-warn-strong focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
            <FileWarning aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
            {fmtNumber(file.warnings.length)} lưu ý khi đọc file
            <ChevronRight aria-hidden className="ml-auto size-4 transition-transform group-open:rotate-90" strokeWidth={2.25} />
          </summary>
          <ul className="max-h-64 list-disc overflow-y-auto border-t border-warn/20 py-2.5 pl-8 pr-3.5 text-[13px] leading-relaxed text-slate-700">
            {file.warnings.slice(0, MAX_WARNINGS).map((w, k) => (
              <li key={k}>{w}</li>
            ))}
            {file.warnings.length > MAX_WARNINGS ? <li className="list-none text-slate-500">… và {fmtNumber(file.warnings.length - MAX_WARNINGS)} lưu ý khác</li> : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
