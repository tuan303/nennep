/**
 * Roster import wizard: state machine + view-model helpers (pure – unit-tested).
 * Flow: upload (.xlsx parsed in the browser) → options (mode, effective date) → preview (server, no writes)
 * → commit with previewHash → done. Changing the mode or the date invalidates the preview (the hash covers them).
 */
import type { RosterRow, StudentImportInput, StudentImportPreview, StudentImportResult, StudentImportRowKind } from "@/lib/contract";
import { normalizeVN } from "@/lib/engine/text";
import type { ClassInfo, LevelId } from "@/lib/types";
import { IMPORT_KIND_ORDER, type ImportTileKind } from "./labels";

export type WizardStep = "upload" | "options" | "preview" | "done";
export type ImportMode = "upsert" | "sync";
/** Preview table filter: rows with a change or an error, every row, or one kind. */
export type PreviewFilter = "CHANGES" | "ALL" | StudentImportRowKind;

export const WIZARD_STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: "upload", label: "Tải file" },
  { id: "options", label: "Tùy chọn" },
  { id: "preview", label: "Xem trước" },
  { id: "done", label: "Hoàn tất" },
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 6000;

export interface ParsedFile {
  fileName: string;
  fileSize: number;
  sheetName: string;
  rows: RosterRow[];
  warnings: string[];
}

export interface WizardState {
  step: WizardStep;
  parsing: boolean;
  parseError?: string;
  file?: ParsedFile;
  mode: ImportMode;
  effectiveDate: string;
  previewing: boolean;
  preview?: StudentImportPreview;
  filter: PreviewFilter;
  query: string;
  applyMissing: boolean;
  committing: boolean;
  /** The server answered 409 on commit: data changed since the preview. */
  conflict: boolean;
  result?: StudentImportResult;
}

export type WizardAction =
  | { type: "parseStart" }
  | { type: "parseOk"; file: ParsedFile }
  | { type: "parseFail"; message: string }
  | { type: "clearFile" }
  | { type: "goto"; step: WizardStep }
  | { type: "setMode"; mode: ImportMode }
  | { type: "setDate"; date: string }
  | { type: "previewStart" }
  | { type: "previewOk"; preview: StudentImportPreview }
  | { type: "previewFail" }
  | { type: "setFilter"; filter: PreviewFilter }
  | { type: "setQuery"; query: string }
  | { type: "setApplyMissing"; value: boolean }
  | { type: "commitStart" }
  | { type: "commitOk"; result: StudentImportResult }
  | { type: "commitFail" }
  | { type: "conflict" }
  | { type: "reset"; today: string };

export function initialWizardState(today: string): WizardState {
  return {
    step: "upload",
    parsing: false,
    mode: "upsert",
    effectiveDate: today,
    previewing: false,
    filter: "CHANGES",
    query: "",
    applyMissing: false,
    committing: false,
    conflict: false,
  };
}

/** Drop the server preview (and everything derived from it). */
function withoutPreview(s: WizardState): WizardState {
  return { ...s, preview: undefined, filter: "CHANGES", query: "", applyMissing: false, conflict: false };
}

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case "parseStart":
      return { ...withoutPreview(s), step: "upload", parsing: true, parseError: undefined, file: undefined };
    case "parseOk":
      return { ...withoutPreview(s), step: "upload", parsing: false, parseError: undefined, file: a.file };
    case "parseFail":
      return { ...withoutPreview(s), step: "upload", parsing: false, parseError: a.message, file: undefined };
    case "clearFile":
      return { ...withoutPreview(s), step: "upload", parseError: undefined, file: undefined };
    case "goto":
      return canEnterStep(s, a.step) ? { ...s, step: a.step } : s;
    case "setMode":
      return a.mode === s.mode ? s : { ...withoutPreview(s), mode: a.mode };
    case "setDate":
      return a.date === s.effectiveDate ? s : { ...withoutPreview(s), effectiveDate: a.date };
    case "previewStart":
      return { ...s, previewing: true };
    case "previewOk":
      return {
        ...s,
        previewing: false,
        preview: a.preview,
        step: "preview",
        filter: changedRowCount(a.preview) > 0 ? "CHANGES" : "ALL",
        query: "",
        applyMissing: false,
        conflict: false,
      };
    case "previewFail":
      return { ...s, previewing: false };
    case "setFilter":
      return { ...s, filter: a.filter };
    case "setQuery":
      return { ...s, query: a.query };
    case "setApplyMissing":
      return { ...s, applyMissing: a.value };
    case "commitStart":
      return { ...s, committing: true };
    case "commitOk":
      return { ...s, committing: false, result: a.result, step: "done", conflict: false };
    case "commitFail":
      return { ...s, committing: false };
    case "conflict":
      return { ...s, committing: false, conflict: true };
    case "reset":
      return initialWizardState(a.today);
    default:
      return s;
  }
}

/** Steps are reachable only in order: options needs rows, preview needs a preview, done needs a result. */
export function canEnterStep(s: WizardState, step: WizardStep): boolean {
  if (step === "upload") return !s.committing && s.step !== "done";
  if (step === "options") return !!s.file && s.file.rows.length > 0 && s.step !== "done";
  if (step === "preview") return !!s.preview;
  return !!s.result;
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.findIndex((x) => x.id === step);
}

/** Request body of preview/commit, or undefined when there is nothing to send. */
export function importInput(s: WizardState, levelId: LevelId): StudentImportInput | undefined {
  if (!s.file || s.file.rows.length === 0 || !s.effectiveDate) return undefined;
  return { levelId, mode: s.mode, effectiveDate: s.effectiveDate, rows: s.file.rows };
}

/* ---------------------------------- File ---------------------------------- */

/** Vietnamese error for a picked file, or undefined when it can be parsed. */
export function fileProblem(file: { name: string; size: number }): string | undefined {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) return "File .xls (Excel 97–2003) chưa được hỗ trợ. Hãy mở file và lưu lại dạng .xlsx.";
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm")) return "Chỉ nhận file Excel .xlsx.";
  if (file.size === 0) return "File rỗng.";
  if (file.size > MAX_FILE_BYTES) return "File lớn hơn 10 MB. Hãy chỉ giữ trang danh sách học sinh.";
  return undefined;
}

export interface RosterFileStats {
  rows: number;
  classes: number;
  /** Rows whose class is not a class of this level (ignoring case and spaces). */
  unknownClassRows: number;
  unknownClasses: string[];
  missingDob: number;
}

/** Quick client-side look at the parsed rows (the server decides the real outcome). */
export function rosterFileStats(rows: readonly RosterRow[], classes: readonly Pick<ClassInfo, "code">[]): RosterFileStats {
  const known = new Set(classes.map((c) => c.code.replace(/\s+/g, "").toUpperCase()));
  const seen = new Set<string>();
  const unknown = new Set<string>();
  let unknownClassRows = 0;
  let missingDob = 0;
  for (const r of rows) {
    const code = r.classCode.replace(/\s+/g, "").toUpperCase();
    if (code) seen.add(code);
    if (!code || !known.has(code)) {
      unknownClassRows += 1;
      if (r.classCode.trim()) unknown.add(r.classCode.trim());
    }
    if (!r.dob) missingDob += 1;
  }
  return { rows: rows.length, classes: seen.size, unknownClassRows, unknownClasses: [...unknown].sort().slice(0, 12), missingDob };
}

/** "1,2 MB" / "350 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("vi-VN")} KB`;
}

/* --------------------------------- Preview -------------------------------- */

export type PreviewRow = StudentImportPreview["rows"][number];

/**
 * INTEGRITY-9: a REINSTATE row that brings a student who left ANOTHER level into this one (chuyển cấp – same Mã HS,
 * history kept). The server marks it with the change text "Chuyển cấp: TH lớp 5A1 (Đã tốt nghiệp) → THCS lớp 6A01".
 */
export function isLevelChangeRow(row: Pick<PreviewRow, "kind" | "changes">): boolean {
  return row.kind === "REINSTATE" && row.changes.some((c) => c.startsWith("Chuyển cấp:"));
}

/** NEW + UPDATE + TRANSFER + REINSTATE rows (what a commit writes besides the "missing" bucket). */
export function changedRowCount(p: Pick<StudentImportPreview, "summary">): number {
  return p.summary.NEW + p.summary.UPDATE + p.summary.TRANSFER + p.summary.REINSTATE;
}

/** Students a commit would modify. */
export function pendingChanges(p: Pick<StudentImportPreview, "summary" | "missing">, applyMissing: boolean): number {
  return changedRowCount(p) + (applyMissing ? p.missing.length : 0);
}

export interface PreviewTile {
  kind: ImportTileKind;
  count: number;
}

/** Summary tiles in display order; "MISSING" only in sync mode. */
export function previewTiles(p: Pick<StudentImportPreview, "summary" | "missing">, mode: ImportMode): PreviewTile[] {
  const tiles: PreviewTile[] = IMPORT_KIND_ORDER.map((kind) => ({ kind, count: p.summary[kind] }));
  if (mode === "sync") tiles.push({ kind: "MISSING", count: p.missing.length });
  return tiles;
}

/** Rows of the preview table for a filter + accent-insensitive search on Mã HS / họ tên / lớp. */
export function filterPreviewRows(rows: readonly PreviewRow[], filter: PreviewFilter, query: string): PreviewRow[] {
  const tokens = normalizeVN(query).split(" ").filter(Boolean);
  return rows.filter((r) => {
    if (filter === "CHANGES" ? r.kind === "UNCHANGED" : filter !== "ALL" && r.kind !== filter) return false;
    if (tokens.length === 0) return true;
    const key = normalizeVN(`${r.id} ${r.name} ${r.classCode}`);
    return tokens.every((t) => key.includes(t));
  });
}

/** Bullet lines of the commit confirmation, e.g. ["12 học sinh tuyển mới", "3 học sinh chuyển lớp"]. */
export function commitSummaryLines(p: Pick<StudentImportPreview, "summary" | "missing">, applyMissing: boolean): string[] {
  const lines: string[] = [];
  const add = (n: number, text: string) => {
    if (n > 0) lines.push(`${n.toLocaleString("vi-VN")} ${text}`);
  };
  add(p.summary.NEW, "học sinh tuyển mới");
  add(p.summary.UPDATE, "học sinh cập nhật thông tin");
  add(p.summary.TRANSFER, "học sinh chuyển lớp");
  add(p.summary.REINSTATE, "học sinh quay lại (Đang học)");
  if (applyMissing) add(p.missing.length, "học sinh chuyển sang Đã chuyển trường");
  return lines;
}

export interface ResultTile {
  key: keyof StudentImportResult;
  label: string;
  count: number;
}

export function resultTiles(r: StudentImportResult): ResultTile[] {
  return [
    { key: "created", label: "Thêm mới", count: r.created },
    { key: "updated", label: "Cập nhật", count: r.updated },
    { key: "transferred", label: "Chuyển lớp", count: r.transferred },
    { key: "reinstated", label: "Quay lại", count: r.reinstated },
    { key: "withdrawn", label: "Chuyển trường", count: r.withdrawn },
    { key: "skipped", label: "Bỏ qua", count: r.skipped },
  ];
}
