"use client";
import { useReducer, useState } from "react";
import { ArrowLeft, ArrowRight, FileUp, RefreshCw, ScanSearch, Upload } from "lucide-react";
import { Button, ConfirmDialog, Sheet, toast } from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { LEVELS } from "@/lib/constants";
import type { LevelDataset } from "@/lib/types";
import {
  commitSummaryLines,
  fileProblem,
  importInput,
  initialWizardState,
  MAX_ROWS,
  pendingChanges,
  stepIndex,
  wizardReducer,
  WIZARD_STEPS,
} from "../lib/import-wizard";
import { StepDone } from "./step-done";
import { StepOptions } from "./step-options";
import { StepPreview } from "./step-preview";
import { StepUpload } from "./step-upload";
import { WizardStepper } from "./wizard-stepper";

export interface ImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ds: LevelDataset;
  today: string;
}

const PARSE_FALLBACK = "Không đọc được file. Vui lòng kiểm tra lại file Excel và thử lại.";

/**
 * "Import danh sách" wizard: upload .xlsx (parsed in the browser) → options → server preview (no writes) →
 * confirm → commit with previewHash (409 = data changed → check again) → result. Progress is kept while the page is open.
 */
export function ImportSheet({ open, onOpenChange, ds, today }: ImportSheetProps) {
  const [state, dispatch] = useReducer(wizardReducer, today, initialWizardState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { refresh } = useDataset(ds.levelId);
  const levelName = LEVELS[ds.levelId].name;
  const busy = state.parsing || state.previewing || state.committing;

  // Re-opening after a finished import starts a fresh wizard.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && state.step === "done") dispatch({ type: "reset", today });
  }

  async function handleFile(file: File) {
    const problem = fileProblem(file);
    if (problem) return dispatch({ type: "parseFail", message: problem });
    dispatch({ type: "parseStart" });
    try {
      const buffer = await file.arrayBuffer();
      const { parseRosterSheet } = await import("@/lib/excel");
      const res = await parseRosterSheet(buffer, file.name);
      if (res.rows.length > MAX_ROWS) {
        return dispatch({ type: "parseFail", message: `File có ${res.rows.length.toLocaleString("vi-VN")} học sinh, vượt giới hạn ${MAX_ROWS.toLocaleString("vi-VN")} học sinh mỗi lần nhập. Hãy tách file theo khối.` });
      }
      dispatch({ type: "parseOk", file: { fileName: file.name, fileSize: file.size, sheetName: res.sheetName, rows: res.rows, warnings: res.warnings } });
    } catch (err) {
      const safe = err instanceof Error && err.name === "ExcelParseError" ? err.message : PARSE_FALLBACK;
      dispatch({ type: "parseFail", message: safe });
    }
  }

  async function runPreview() {
    const input = importInput(state, ds.levelId);
    if (!input) return;
    dispatch({ type: "previewStart" });
    try {
      const preview = await api.students.importPreview(input);
      dispatch({ type: "previewOk", preview });
    } catch (err) {
      dispatch({ type: "previewFail" });
      toast.error(errorMessage(err));
    }
  }

  async function commit() {
    const input = importInput(state, ds.levelId);
    const preview = state.preview;
    if (!input || !preview) return;
    dispatch({ type: "commitStart" });
    try {
      const result = await api.students.importCommit({
        ...input,
        previewHash: preview.previewHash,
        applyMissingAsWithdrawn: state.mode === "sync" && state.applyMissing,
      });
      dispatch({ type: "commitOk", result });
      toast.success("Đã cập nhật danh sách học sinh.");
      await refresh();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        // The preview is stale: close the confirmation, flag it and let the user check again.
        dispatch({ type: "conflict" });
        toast.warning(err.message);
        return;
      }
      dispatch({ type: "commitFail" });
      toast.error(errorMessage(err));
      throw err; // keeps the confirmation open for a retry
    }
  }

  const pending = state.preview ? pendingChanges(state.preview, state.mode === "sync" && state.applyMissing) : 0;
  const stepNo = stepIndex(state.step) + 1;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => (v || !busy) && onOpenChange(v)}
        dismissible={!busy}
        title="Nhập danh sách học sinh"
        description={`${levelName} · Bước ${stepNo}/${WIZARD_STEPS.length}`}
        icon={FileUp}
        size="lg"
        footer={renderFooter()}
      >
        <div className="flex flex-col gap-5">
          <WizardStepper step={state.step} />
          {state.step === "upload" ? (
            <StepUpload
              file={state.file}
              parsing={state.parsing}
              parseError={state.parseError}
              classes={ds.classes}
              levelName={levelName}
              onFile={(f) => void handleFile(f)}
              onClear={() => dispatch({ type: "clearFile" })}
            />
          ) : null}
          {state.step === "options" && state.file ? (
            <StepOptions
              file={state.file}
              mode={state.mode}
              effectiveDate={state.effectiveDate}
              levelName={levelName}
              onMode={(mode) => dispatch({ type: "setMode", mode })}
              onDate={(date) => dispatch({ type: "setDate", date })}
            />
          ) : null}
          {state.step === "preview" && state.preview ? (
            <StepPreview
              preview={state.preview}
              mode={state.mode}
              effectiveDate={state.effectiveDate}
              filter={state.filter}
              query={state.query}
              applyMissing={state.applyMissing}
              conflict={state.conflict}
              onFilter={(filter) => dispatch({ type: "setFilter", filter })}
              onQuery={(query) => dispatch({ type: "setQuery", query })}
              onApplyMissing={(value) => dispatch({ type: "setApplyMissing", value })}
            />
          ) : null}
          {state.step === "done" && state.result ? <StepDone result={state.result} fileName={state.file?.fileName} /> : null}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cập nhật danh sách học sinh?"
        message={`Thay đổi được áp dụng ngay cho ${levelName} và ghi vào nhật ký hệ thống.`}
        confirmLabel={`Cập nhật ${pending.toLocaleString("vi-VN")} học sinh`}
        tone={state.applyMissing && state.mode === "sync" ? "danger" : "primary"}
        onConfirm={commit}
      >
        {state.preview ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {commitSummaryLines(state.preview, state.mode === "sync" && state.applyMissing).map((line) => (
              <li key={line} className="num">
                {line}
              </li>
            ))}
            {state.preview.summary.INVALID > 0 ? <li className="num text-bad-strong">{state.preview.summary.INVALID.toLocaleString("vi-VN")} dòng lỗi sẽ bị bỏ qua</li> : null}
          </ul>
        ) : null}
      </ConfirmDialog>
    </>
  );

  function renderFooter() {
    if (state.step === "upload") {
      return (
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Đóng
          </Button>
          <Button iconRight={ArrowRight} disabled={!state.file || state.file.rows.length === 0 || busy} onClick={() => dispatch({ type: "goto", step: "options" })}>
            Tiếp tục
          </Button>
        </>
      );
    }
    if (state.step === "options") {
      return (
        <>
          <Button variant="secondary" icon={ArrowLeft} onClick={() => dispatch({ type: "goto", step: "upload" })} disabled={busy}>
            Quay lại
          </Button>
          <Button icon={ScanSearch} loading={state.previewing} disabled={!state.effectiveDate} onClick={() => void runPreview()}>
            Kiểm tra trước
          </Button>
        </>
      );
    }
    if (state.step === "preview") {
      return (
        <>
          <Button variant="secondary" icon={ArrowLeft} onClick={() => dispatch({ type: "goto", step: "options" })} disabled={busy}>
            Quay lại
          </Button>
          {state.conflict ? (
            <Button icon={RefreshCw} loading={state.previewing} onClick={() => void runPreview()}>
              Kiểm tra lại
            </Button>
          ) : (
            <Button icon={Upload} disabled={pending === 0 || busy} onClick={() => setConfirmOpen(true)} title={pending === 0 ? "Không có thay đổi nào để cập nhật" : undefined}>
              {pending > 0 ? `Cập nhật ${pending.toLocaleString("vi-VN")} học sinh` : "Không có thay đổi"}
            </Button>
          )}
        </>
      );
    }
    return (
      <>
        <Button variant="secondary" icon={FileUp} onClick={() => dispatch({ type: "reset", today })}>
          Nhập file khác
        </Button>
        <Button onClick={() => onOpenChange(false)}>Xong</Button>
      </>
    );
  }
}
