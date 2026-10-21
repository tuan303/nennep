"use client";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { Button, IconButton, Spinner, cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { ClassInfo } from "@/lib/types";
import { formatFileSize, rosterFileStats, type ParsedFile } from "../lib/import-wizard";
import { Callout } from "../parts";

const ACCEPT = ".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const WARNINGS_SHOWN = 5;

export interface StepUploadProps {
  file?: ParsedFile;
  parsing: boolean;
  parseError?: string;
  classes: readonly ClassInfo[];
  levelName: string;
  onFile: (file: File) => void;
  onClear: () => void;
}

/** Step 1: drag & drop / pick an .xlsx, then show the detected sheet, row count and parse warnings. */
export function StepUpload({ file, parsing, parseError, classes, levelName, onFile, onClear }: StepUploadProps) {
  return (
    <div className="flex flex-col gap-4">
      {file && !parsing ? <ParsedSummary file={file} classes={classes} levelName={levelName} onClear={onClear} /> : <DropZone parsing={parsing} onFile={onFile} />}
      {parseError ? (
        <Callout tone="bad" title="Không đọc được file">
          {parseError}
        </Callout>
      ) : null}
      {!file ? (
        <Callout tone="brand" title="File cần có các cột Mã HS, Họ và tên, Lớp">
          Có thể thêm Ngày sinh, Giới tính, Trạng thái. Mẹo: dùng nút “Xuất danh sách” để lấy file đúng định dạng, sửa rồi nhập lại.
        </Callout>
      ) : null}
    </div>
  );
}

function DropZone({ parsing, onFile }: { parsing: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function drop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !parsing) onFile(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors duration-150 sm:py-10",
        over ? "border-brand-500 bg-brand-50" : "border-brand-200 bg-brand-50/40",
      )}
    >
      <span aria-hidden className="inline-flex size-14 items-center justify-center rounded-2xl bg-surface text-brand-600 shadow-card ring-1 ring-inset ring-brand-600/10">
        {parsing ? <Spinner size="md" label="" /> : <FileSpreadsheet className="size-7" strokeWidth={1.75} />}
      </span>
      {parsing ? (
        <p role="status" className="text-sm font-semibold text-brand-900">
          Đang đọc file…
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-brand-900">
              <span className="pointer-coarse:hidden">Kéo thả file Excel vào đây</span>
              <span className="hidden pointer-coarse:inline">Chọn file Excel danh sách học sinh</span>
            </p>
            <p className="text-[13px] text-slate-500">Định dạng .xlsx, tối đa 10 MB và 6.000 học sinh.</p>
          </div>
          <Button icon={Upload} onClick={() => input.current?.click()}>
            Chọn file .xlsx
          </Button>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

function ParsedSummary({ file, classes, levelName, onClear }: { file: ParsedFile; classes: readonly ClassInfo[]; levelName: string; onClear: () => void }) {
  const stats = useMemo(() => rosterFileStats(file.rows, classes), [file.rows, classes]);
  const [showAll, setShowAll] = useState(false);
  const warnings = showAll ? file.warnings : file.warnings.slice(0, WARNINGS_SHOWN);

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok-strong ring-1 ring-inset ring-ok/20">
          <FileSpreadsheet className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-brand-900" title={file.fileName}>
            {file.fileName}
          </p>
          <p className="num text-[13px] text-slate-500">
            {formatFileSize(file.fileSize)} · Trang tính “{file.sheetName}”
          </p>
        </div>
        <IconButton icon={X} label="Bỏ file, chọn file khác" size="sm" onClick={onClear} />
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Figure label="Học sinh" value={stats.rows} />
        <Figure label="Lớp" value={stats.classes} />
        <Figure label="Thiếu ngày sinh" value={stats.missingDob} muted />
      </dl>

      {stats.rows === 0 ? (
        <Callout tone="bad">Không có dòng học sinh nào có Mã HS. Hãy kiểm tra lại file.</Callout>
      ) : stats.unknownClassRows > 0 ? (
        <Callout tone="warn" title={`${fmtNumber(stats.unknownClassRows)} dòng có lớp không thuộc ${levelName}`}>
          {stats.unknownClasses.length > 0 ? `Lớp: ${stats.unknownClasses.join(", ")}. ` : ""}Các dòng này sẽ được đánh dấu Lỗi và bỏ qua khi cập nhật.
        </Callout>
      ) : null}

      {file.warnings.length > 0 ? (
        <Callout tone="warn" title={`${fmtNumber(file.warnings.length)} cảnh báo khi đọc file`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {file.warnings.length > WARNINGS_SHOWN ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1.5 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-500">
              {showAll ? "Thu gọn" : `Xem tất cả ${fmtNumber(file.warnings.length)} cảnh báo`}
            </button>
          ) : null}
        </Callout>
      ) : null}
    </div>
  );
}

function Figure({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-inset ring-border">
      <dt className="truncate text-xs text-slate-500">{label}</dt>
      <dd className={cn("num text-xl font-bold leading-7", muted ? "text-slate-600" : "text-brand-900")}>{fmtNumber(value)}</dd>
    </div>
  );
}
