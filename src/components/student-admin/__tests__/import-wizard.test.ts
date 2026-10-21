import { describe, expect, it } from "vitest";
import type { RosterRow, StudentImportPreview } from "@/lib/contract";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import {
  canEnterStep,
  changedRowCount,
  commitSummaryLines,
  fileProblem,
  filterPreviewRows,
  formatFileSize,
  importInput,
  initialWizardState,
  isLevelChangeRow,
  pendingChanges,
  previewTiles,
  resultTiles,
  rosterFileStats,
  stepIndex,
  wizardReducer,
  type ParsedFile,
  type WizardAction,
  type WizardState,
} from "../lib/import-wizard";

const ds = makeFixtureDataset();

const ROWS: RosterRow[] = [
  { rowNumber: 5, id: "26069901", name: "Nguyễn Văn An", classCode: "6A01", dob: "2015-01-02" },
  { rowNumber: 6, id: "26060101", name: "Nguyễn Trường Phúc", classCode: "6a 02" },
  { rowNumber: 7, id: "26069902", name: "Lê Bình", classCode: "9Z9" },
  { rowNumber: 8, id: "26069903", name: "Trần Cúc", classCode: "" },
];

const FILE: ParsedFile = { fileName: "ds.xlsx", fileSize: 12_000, sheetName: "DS Học sinh", rows: ROWS, warnings: [] };

function preview(patch: Partial<StudentImportPreview> = {}): StudentImportPreview {
  return {
    previewHash: "hash-12345678",
    summary: { NEW: 1, UPDATE: 1, TRANSFER: 1, REINSTATE: 0, UNCHANGED: 2, INVALID: 1, total: 6, missing: 2 },
    rows: [
      { rowNumber: 5, id: "26069901", name: "Nguyễn Văn An", classCode: "6A01", kind: "NEW", changes: [], errors: [] },
      { rowNumber: 6, id: "26060101", name: "Nguyễn Trường Phúc", classCode: "6A02", kind: "TRANSFER", changes: ["Lớp: 6A01 → 6A02"], errors: [] },
      { rowNumber: 7, id: "26069902", name: "Lê Bình", classCode: "9Z9", kind: "INVALID", changes: [], errors: ["Lớp 9Z9 không tồn tại"] },
      { rowNumber: 9, id: "26060102", name: "Trần Bảo Anh", classCode: "6A01", kind: "UNCHANGED", changes: [], errors: [] },
      { rowNumber: 10, id: "26060103", name: "Lê Minh Châu", classCode: "6A01", kind: "UPDATE", changes: ["Ngày sinh: – → 01/02/2015"], errors: [] },
      { rowNumber: 11, id: "26060104", name: "Phạm Gia Huy", classCode: "6A01", kind: "UNCHANGED", changes: [], errors: [] },
    ],
    missing: ds.students.slice(10, 12),
    ...patch,
  };
}

function run(state: WizardState, ...actions: WizardAction[]): WizardState {
  return actions.reduce(wizardReducer, state);
}

describe("wizardReducer", () => {
  const start = initialWizardState(FIXTURE_TODAY);

  it("walks upload → options → preview → done", () => {
    let s = run(start, { type: "parseStart" });
    expect(s.parsing).toBe(true);
    s = run(s, { type: "parseOk", file: FILE });
    expect(s).toMatchObject({ step: "upload", parsing: false, file: FILE });
    s = run(s, { type: "goto", step: "options" });
    expect(s.step).toBe("options");
    s = run(s, { type: "previewStart" }, { type: "previewOk", preview: preview() });
    expect(s).toMatchObject({ step: "preview", previewing: false, filter: "CHANGES", conflict: false });
    s = run(s, { type: "setApplyMissing", value: true }, { type: "commitStart" });
    expect(s.committing).toBe(true);
    s = run(s, { type: "commitOk", result: { created: 1, updated: 1, transferred: 1, reinstated: 0, withdrawn: 2, skipped: 1 } });
    expect(s.step).toBe("done");
    expect(canEnterStep(s, "upload")).toBe(false);
    expect(run(s, { type: "reset", today: "2026-10-22" })).toEqual(initialWizardState("2026-10-22"));
  });

  it("blocks steps whose data is missing", () => {
    expect(run(start, { type: "goto", step: "options" }).step).toBe("upload");
    expect(run(start, { type: "goto", step: "preview" }).step).toBe("upload");
    const empty = run(start, { type: "parseOk", file: { ...FILE, rows: [] } }, { type: "goto", step: "options" });
    expect(empty.step).toBe("upload");
  });

  it("changing mode or date drops the preview (hash covers them)", () => {
    const s = run(start, { type: "parseOk", file: FILE }, { type: "previewOk", preview: preview() }, { type: "setApplyMissing", value: true });
    const m = run(s, { type: "setMode", mode: "sync" });
    expect(m).toMatchObject({ mode: "sync", preview: undefined, applyMissing: false });
    expect(run(s, { type: "setMode", mode: "upsert" })).toBe(s);
    expect(run(s, { type: "setDate", date: "2026-10-01" })).toMatchObject({ effectiveDate: "2026-10-01", preview: undefined });
  });

  it("a new file clears the old preview and errors", () => {
    const s = run(start, { type: "parseFail", message: "Không đọc được" });
    expect(s.parseError).toBe("Không đọc được");
    const t = run(s, { type: "parseOk", file: FILE }, { type: "previewOk", preview: preview() }, { type: "parseStart" });
    expect(t).toMatchObject({ step: "upload", preview: undefined, file: undefined, parseError: undefined });
    expect(run(t, { type: "parseOk", file: FILE }, { type: "clearFile" }).file).toBeUndefined();
  });

  it("conflict keeps the preview and flags it; a new preview clears it", () => {
    const s = run(start, { type: "parseOk", file: FILE }, { type: "previewOk", preview: preview() }, { type: "commitStart" }, { type: "conflict" });
    expect(s).toMatchObject({ committing: false, conflict: true, step: "preview" });
    expect(run(s, { type: "previewOk", preview: preview() }).conflict).toBe(false);
    expect(run(s, { type: "commitFail" }).committing).toBe(false);
  });

  it("shows ALL rows when nothing changes", () => {
    const p = preview({ summary: { NEW: 0, UPDATE: 0, TRANSFER: 0, REINSTATE: 0, UNCHANGED: 3, INVALID: 0, total: 3, missing: 0 } });
    expect(run(start, { type: "previewOk", preview: p }).filter).toBe("ALL");
  });
});

describe("importInput / steps", () => {
  it("builds the request body", () => {
    const s = run(initialWizardState(FIXTURE_TODAY), { type: "parseOk", file: FILE }, { type: "setMode", mode: "sync" });
    expect(importInput(s, "THCS")).toEqual({ levelId: "THCS", mode: "sync", effectiveDate: FIXTURE_TODAY, rows: ROWS });
    expect(importInput(initialWizardState(FIXTURE_TODAY), "THCS")).toBeUndefined();
    expect(importInput({ ...s, effectiveDate: "" }, "THCS")).toBeUndefined();
    expect(stepIndex("preview")).toBe(2);
  });
});

describe("file checks", () => {
  it("fileProblem", () => {
    expect(fileProblem({ name: "DS.XLSX", size: 100 })).toBeUndefined();
    expect(fileProblem({ name: "ds.xls", size: 100 })).toMatch(/\.xls/);
    expect(fileProblem({ name: "ds.csv", size: 100 })).toBe("Chỉ nhận file Excel .xlsx.");
    expect(fileProblem({ name: "ds.xlsx", size: 0 })).toBe("File rỗng.");
    expect(fileProblem({ name: "ds.xlsx", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });

  it("rosterFileStats matches classes ignoring case and spaces", () => {
    expect(rosterFileStats(ROWS, ds.classes)).toEqual({ rows: 4, classes: 3, unknownClassRows: 2, unknownClasses: ["9Z9"], missingDob: 3 });
  });

  it("formatFileSize", () => {
    expect(formatFileSize(12_000)).toBe("12 KB");
    expect(formatFileSize(300)).toBe("1 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});

describe("preview helpers", () => {
  const p = preview();

  it("counts changes and pending writes", () => {
    expect(changedRowCount(p)).toBe(3);
    expect(pendingChanges(p, false)).toBe(3);
    expect(pendingChanges(p, true)).toBe(5);
  });

  it("tiles in order, MISSING only in sync mode", () => {
    expect(previewTiles(p, "upsert").map((t) => `${t.kind}:${t.count}`)).toEqual(["NEW:1", "UPDATE:1", "TRANSFER:1", "REINSTATE:0", "UNCHANGED:2", "INVALID:1"]);
    expect(previewTiles(p, "sync").at(-1)).toEqual({ kind: "MISSING", count: 2 });
  });

  it("filters rows by kind and accent-insensitive search", () => {
    expect(filterPreviewRows(p.rows, "CHANGES", "").map((r) => r.kind)).toEqual(["NEW", "TRANSFER", "INVALID", "UPDATE"]);
    expect(filterPreviewRows(p.rows, "ALL", "")).toHaveLength(6);
    expect(filterPreviewRows(p.rows, "UNCHANGED", "")).toHaveLength(2);
    expect(filterPreviewRows(p.rows, "ALL", "truong phuc").map((r) => r.id)).toEqual(["26060101"]);
    expect(filterPreviewRows(p.rows, "CHANGES", "6a01").map((r) => r.id)).toEqual(["26069901", "26060103"]);
  });

  it("commit summary lines", () => {
    expect(commitSummaryLines(p, false)).toEqual(["1 học sinh tuyển mới", "1 học sinh cập nhật thông tin", "1 học sinh chuyển lớp"]);
    expect(commitSummaryLines(p, true).at(-1)).toBe("2 học sinh chuyển sang Đã chuyển trường");
  });

  it("result tiles", () => {
    expect(resultTiles({ created: 3, updated: 2, transferred: 1, reinstated: 0, withdrawn: 4, skipped: 1 }).map((t) => t.count)).toEqual([3, 2, 1, 0, 4, 1]);
  });
});

describe("INTEGRITY-9: chuyển cấp rows of the roster import", () => {
  it("recognises the server's level-change REINSTATE rows", () => {
    expect(isLevelChangeRow({ kind: "REINSTATE", changes: ["Chuyển cấp: Tiểu học lớp 5A1 (Đã tốt nghiệp) → THCS lớp 6A01"] })).toBe(true);
    expect(isLevelChangeRow({ kind: "REINSTATE", changes: ["Quay lại lớp 6A01"] })).toBe(false);
    expect(isLevelChangeRow({ kind: "TRANSFER", changes: ["Chuyển cấp: x"] })).toBe(false);
  });
});
