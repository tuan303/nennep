"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { FileUp } from "lucide-react";
import { Card, ConfirmDialog, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { useDataset, useLevel } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { LEVELS } from "@/lib/constants";
import type { WorkbookCommitResult, WorkbookPreview, WorkbookPreviewInput } from "@/lib/contract";
import { Notice } from "@/components/data-inspect/notice";
import { CommitResult } from "./commit-result";
import { DropZone } from "./drop-zone";
import { FileSummary, type ParsedFile } from "./file-summary";
import { ImportOptionsPanel } from "./import-options";
import { PreviewResult } from "./preview-result";
import { WizardSteps } from "./wizard-steps";
import {
  MAX_REQUEST_BYTES,
  TOO_LARGE_MESSAGE,
  classifyImportError,
  defaultOptions,
  formatBytes,
  jsonBytes,
  optionsEqual,
  payloadCounts,
  previewTotals,
  requestPayload,
  type ImportOptions,
} from "./lib/import-model";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

interface PreviewState {
  result: WorkbookPreview;
  options: ImportOptions;
  /** "Ghi đè thay đổi trong phần mềm" as previewed (part of the preview hash). */
  overwrite: boolean;
  /** "Tính lại sự việc đã ghi theo bảng điểm mới" as previewed (part of the preview hash). */
  rescore: boolean;
  /** Exact request of the preview – re-sent with the hash on commit. */
  input: WorkbookPreviewInput & { options: ImportOptions };
}

function StepBlock({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5" aria-label={title}>
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-brand-900">
        <span className="num inline-flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-600/15">{step}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** FR-XLS-001/002: upload → choose sections → preview (no writes) → confirm (commit with previewHash). */
export function ImportWizard() {
  const { levelId, setLevelId, accessibleLevels } = useLevel();
  const { refresh } = useDataset();
  const today = useToday();
  const previewRef = useRef<HTMLDivElement>(null);

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [options, setOptions] = useState<ImportOptions | null>(null);
  /**
   * INTEGRITY-2/5: records changed in the app since their last import (GVCN feedback, review fixes…) are skipped and
   * codes that now belong to another class / error are refused – unless the admin explicitly overwrites them.
   * A top-level request field (not an import option), sent identically to preview and commit.
   */
  const [overwrite, setOverwrite] = useState(false);
  /** Re-score stored incidents with the current error table (top-level `rescoreExisting`, like `overwrite`). */
  const [rescore, setRescore] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<WorkbookCommitResult | null>(null);

  const counts = useMemo(() => (file ? payloadCounts(file.payload) : null), [file]);
  const request = useMemo(
    () =>
      file && options
        ? {
            payload: requestPayload(file.payload, options),
            options,
            ...(overwrite ? { overwriteAppChanges: true } : {}),
            ...(rescore && options.incidents ? { rescoreExisting: true } : {}),
          }
        : null,
    [file, options, overwrite, rescore],
  );
  const bytes = useMemo(() => (request ? jsonBytes(request) : 0), [request]);
  const stale =
    !!preview &&
    !!options &&
    (!optionsEqual(preview.options, options) || preview.overwrite !== overwrite || preview.rescore !== (rescore && options.incidents));
  const target = file?.payload.levelId;
  const targetAllowed = target !== undefined && accessibleLevels.includes(target);

  const step = !file ? 0 : result ? 3 : preview && !stale && !conflict ? 3 : previewing ? 2 : 1;

  function reset() {
    setFile(null);
    setOptions(null);
    setOverwrite(false);
    setRescore(false);
    setParseError(null);
    setPreview(null);
    setPreviewError(null);
    setConflict(false);
    setResult(null);
  }

  async function handleFile(f: File) {
    reset();
    if (!/\.xlsx$/i.test(f.name)) {
      setParseError("Chỉ nhận file Excel định dạng .xlsx. Với file .xls, hãy mở bằng Excel và lưu lại dưới dạng .xlsx.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setParseError(`File quá lớn (${formatBytes(f.size)}). Vui lòng chọn file nhỏ hơn ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setParsing(true);
    try {
      const { parseNshmWorkbook } = await import("@/lib/excel");
      const parsed = await parseNshmWorkbook(await f.arrayBuffer(), f.name);
      setFile({ fileName: f.name, size: f.size, payload: parsed.payload, warnings: parsed.warnings });
      setOptions(defaultOptions(parsed.payload));
    } catch (err) {
      const safe = err instanceof Error && err.name === "ExcelParseError";
      setParseError(safe ? (err as Error).message : "Không đọc được file. Hãy kiểm tra file đúng mẫu sổ nền nếp và không bị đặt mật khẩu.");
    } finally {
      setParsing(false);
    }
  }

  async function runPreview() {
    if (!request) return;
    setPreviewError(null);
    if (bytes > MAX_REQUEST_BYTES) {
      setPreviewError(TOO_LARGE_MESSAGE);
      return;
    }
    setPreviewing(true);
    try {
      const res = await api.workbook.preview(request);
      setPreview({
        result: res,
        options: request.options,
        overwrite: request.overwriteAppChanges === true,
        rescore: request.rescoreExisting === true,
        input: request,
      });
      setConflict(false);
      requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      const kind = classifyImportError(err);
      setPreviewError(kind === "tooLarge" ? TOO_LARGE_MESSAGE : errorMessage(err, "Chưa kiểm tra được file. Vui lòng thử lại."));
    } finally {
      setPreviewing(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setCommitting(true);
    try {
      const res = await api.workbook.commit({ ...preview.input, previewHash: preview.result.previewHash });
      setResult(res);
      toast.success("Đã nhập dữ liệu thành công", { description: `Lô nhập ${res.batchId}` });
      if (preview.result.levelId === levelId) await refresh();
    } catch (err) {
      const kind = classifyImportError(err);
      if (kind === "conflict") {
        setConflict(true);
        toast.error("Dữ liệu đã thay đổi – hãy kiểm tra lại trước khi nhập.");
      } else {
        toast.error(kind === "tooLarge" ? TOO_LARGE_MESSAGE : errorMessage(err, "Chưa nhập được dữ liệu. Vui lòng thử lại."));
      }
    } finally {
      setCommitting(false);
    }
  }

  const totals = preview && options ? previewTotals(preview.result, preview.options) : null;
  const busy = parsing || previewing || committing;

  return (
    <Card title="Nhập sổ nền nếp từ Excel" subtitle="Kiểm tra trước khi ghi – chưa có dữ liệu nào được ghi cho đến bước Xác nhận nhập." icon={FileUp}>
      <div className="flex flex-col gap-5">
        <WizardSteps current={step} done={!!result} />

        {result && target ? (
          <CommitResult result={result} levelId={target} currentLevel={levelId} onSwitchLevel={setLevelId} onRestart={reset} />
        ) : (
          <>
            {!file ? (
              <div className="flex flex-col gap-3">
                <DropZone onFile={(f) => void handleFile(f)} busy={parsing} />
                {parseError ? (
                  <Notice tone="bad" role="alert" title="Không đọc được file">
                    {parseError}
                  </Notice>
                ) : null}
              </div>
            ) : (
              <FileSummary file={file} counts={counts!} currentLevel={levelId} accessibleLevels={accessibleLevels} onSwitchLevel={setLevelId} onReset={reset} disabled={busy} />
            )}

            {file && options && counts ? (
              <StepBlock step={2} title="Chọn dữ liệu cần nhập">
                <ImportOptionsPanel
                  options={options}
                  onChange={setOptions}
                  overwriteAppChanges={overwrite}
                  onOverwriteChange={setOverwrite}
                  rescoreExisting={rescore}
                  onRescoreChange={setRescore}
                  counts={counts}
                  requestBytes={bytes}
                  onPreview={() => void runPreview()}
                  previewing={previewing}
                  disabled={!targetAllowed || committing}
                />
                {previewError ? (
                  <Notice tone="bad" role="alert" title="Chưa kiểm tra được">
                    {previewError}
                  </Notice>
                ) : null}
              </StepBlock>
            ) : null}

            {preview && options && counts && target ? (
              <div ref={previewRef} className="scroll-mt-24">
                <StepBlock step={3} title="Kết quả kiểm tra">
                  <PreviewResult
                    preview={preview.result}
                    options={preview.options}
                    counts={counts}
                    stale={stale}
                    conflict={conflict}
                    levelId={target}
                    today={today}
                    busy={busy}
                    onRerun={() => void runPreview()}
                    onCommit={() => setConfirmOpen(true)}
                  />
                </StepBlock>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={target ? `Nhập dữ liệu vào cấp ${LEVELS[target].name}?` : "Xác nhận nhập"}
        tone={preview?.options.config || preview?.overwrite ? "danger" : "primary"}
        confirmLabel="Xác nhận nhập"
        message={
          totals
            ? `Sẽ tạo ${fmtNumber(totals.willCreate)} và cập nhật ${fmtNumber(totals.willUpdate)} bản ghi${totals.error > 0 ? `; ${fmtNumber(totals.error)} dòng lỗi được bỏ qua` : ""}. ` +
              `${preview?.options.config ? "Cấu hình đã phê duyệt sẽ bị ghi đè. " : ""}` +
              `${preview?.overwrite ? "Các thay đổi đã làm trong phần mềm (phản hồi GVCN, sửa khi rà soát…) sẽ bị thay bằng nội dung file. " : ""}` +
              `${preview?.rescore ? `Các sự việc đã ghi có trong file sẽ được tính lại theo bảng điểm lỗi mới${preview.overwrite ? "" : " (trừ sự việc nhập hoặc sửa trong phần mềm)"}. ` : ""}` +
              "Thao tác được ghi vào nhật ký và có thể mất đến 1 phút."
            : undefined
        }
        onConfirm={commit}
      />
    </Card>
  );
}
