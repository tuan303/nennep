/**
 * Server-render smoke test of the presentational parts of Quản lý học sinh (no providers needed).
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StudentImportPreview } from "@/lib/contract";
import { ALL_PERIOD, studentStats } from "@/lib/engine";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { ClassSizeBoard } from "../class-size-board";
import { StepDone } from "../import/step-done";
import { StepOptions } from "../import/step-options";
import { StepPreview } from "../import/step-preview";
import { StepUpload } from "../import/step-upload";
import { WizardStepper } from "../import/wizard-stepper";
import { buildRosterIndex, classSizeRows, DEFAULT_ROSTER_FILTERS, filterRoster, sizeSummary, statusCounts, violationCountMap } from "../lib/roster";
import { studentTimeline } from "../lib/timeline";
import { RecordTimeline } from "../record-timeline";
import { RosterTable } from "../roster-table";
import { RosterToolbar } from "../roster-toolbar";
import { rowMenuEntries } from "../row-actions-menu";
import { SummaryCards } from "../summary-cards";

// tsconfig keeps JSX for Next ("preserve"), so vitest compiles it to React.createElement: expose React globally.
Object.assign(globalThis, { React });

const noop = () => undefined;
const ds = makeFixtureDataset();
const violations = violationCountMap(studentStats(ds, { period: ALL_PERIOD }, FIXTURE_TODAY));
const sizes = classSizeRows(ds.classes, ds.students);

describe("Quản lý học sinh render", () => {
  it("summary cards", () => {
    const html = renderToStaticMarkup(
      createElement(SummaryCards, {
        counts: statusCounts(ds.students),
        size: sizeSummary(sizes),
        withViolations: 30,
        onShowActive: noop,
        onShowLeft: noop,
        onShowSizes: noop,
      }),
    );
    for (const t of ["Đang học", "Đã chuyển / nghỉ", "Lớp lệch sĩ số", "HS có vi phạm", "1 chuyển trường", "8 lớp · TB 7,4 HS/lớp"]) expect(html).toContain(t);
  });

  it("toolbar and roster table (pages of 50, actions menu, violation counts)", () => {
    const toolbar = renderToStaticMarkup(createElement(RosterToolbar, { ds, filters: DEFAULT_ROSTER_FILTERS, onChange: noop }));
    for (const t of ["Tìm theo tên hoặc mã HS", "Tất cả khối", "Khối 6", "Tất cả lớp", "Đang học", "Đã chuyển/nghỉ"]) expect(toolbar).toContain(t);

    const rows = filterRoster(buildRosterIndex(ds.students, ds.classes), { ...DEFAULT_ROSTER_FILTERS, status: "ALL" });
    const html = renderToStaticMarkup(createElement(RosterTable, { rows, classes: ds.classes, violations, onAction: noop, emptyState: null }));
    for (const t of ["Mã HS", "Họ và tên", "Ngày sinh", "Lớp", "Trạng thái", "Lượt vi phạm", "Thao tác với", "Xem thêm 10 dòng", "Nguyễn Thu Hà"]) expect(html).toContain(t);
    expect(html).toContain(`Xem hồ sơ Phạm Thiện Khôi`);

    const empty = renderToStaticMarkup(createElement(RosterTable, { rows: [], classes: ds.classes, violations, onAction: noop, emptyState: createElement("p", null, "Không tìm thấy") }));
    expect(empty).toContain("Không tìm thấy");
  });

  it("row menu entries depend on the status", () => {
    expect(rowMenuEntries({ status: "ACTIVE" }).flat().map((e) => e.action)).toEqual(["profile", "history", "edit", "transfer", "withdraw"]);
    expect(rowMenuEntries({ status: "GRADUATED" }).flat().map((e) => e.action)).toEqual(["profile", "history", "edit", "reinstate"]);
    // Chuyển cấp only when another level can be opened.
    expect(rowMenuEntries({ status: "GRADUATED" }, { canPromote: true }).flat().map((e) => e.action)).toEqual(["profile", "history", "edit", "reinstate", "promote"]);
    expect(rowMenuEntries({ status: "ACTIVE" }, { canPromote: true }).flat().map((e) => e.action)).toContain("promote");
  });

  it("class size board", () => {
    const html = renderToStaticMarkup(createElement(ClassSizeBoard, { rows: sizes, summary: sizeSummary(sizes), onPickClass: noop }));
    for (const t of ["Khối 6", "Khối 7", "6A01", "Thiếu", "lớp lệch", "Chỉ lớp lệch sĩ số"]) expect(html).toContain(t);
  });

  it("record timeline", () => {
    const html = renderToStaticMarkup(
      createElement(RecordTimeline, {
        items: studentTimeline([
          { type: "ENROLL", date: "2026-08-17", toClass: "6A01", by: "admin@nshm.test", at: "2026-08-10T01:00:00.000Z" },
          { type: "TRANSFER_CLASS", date: "2026-10-01", fromClass: "6A01", toClass: "6A02", note: "Theo đơn", by: "admin@nshm.test", at: "2026-10-01T03:00:00.000Z" },
        ]),
      }),
    );
    for (const t of ["Chuyển lớp 6A01 → 6A02", "Tuyển mới vào lớp 6A01", "Theo đơn", "01/10/2026", "admin@nshm.test"]) expect(html).toContain(t);
  });
});

describe("import wizard render", () => {
  const file = {
    fileName: "DS_HocSinh_THCS.xlsx",
    fileSize: 24_000,
    sheetName: "DS Học sinh",
    rows: [
      { rowNumber: 5, id: "26069901", name: "Nguyễn Văn An", classCode: "6A01" },
      { rowNumber: 6, id: "26069902", name: "Lê Bình", classCode: "9Z9" },
    ],
    warnings: Array.from({ length: 7 }, (_, i) => `Cảnh báo số ${i + 1}`),
  };

  it("stepper and upload step", () => {
    expect(renderToStaticMarkup(createElement(WizardStepper, { step: "preview" }))).toContain("Xem trước");
    const empty = renderToStaticMarkup(createElement(StepUpload, { parsing: false, classes: ds.classes, levelName: "THCS", onFile: noop, onClear: noop }));
    for (const t of ["Kéo thả file Excel vào đây", "Chọn file .xlsx", "Mã HS, Họ và tên, Lớp"]) expect(empty).toContain(t);
    const parsed = renderToStaticMarkup(createElement(StepUpload, { file, parsing: false, classes: ds.classes, levelName: "THCS", onFile: noop, onClear: noop }));
    for (const t of ["DS_HocSinh_THCS.xlsx", "DS Học sinh", "1 dòng có lớp không thuộc THCS", "9Z9", "7 cảnh báo", "Xem tất cả 7 cảnh báo"]) expect(parsed).toContain(t);
    const failed = renderToStaticMarkup(createElement(StepUpload, { parsing: false, parseError: "Chỉ nhận file Excel .xlsx.", classes: ds.classes, levelName: "THCS", onFile: noop, onClear: noop }));
    expect(failed).toContain("Không đọc được file");
  });

  it("options step", () => {
    const html = renderToStaticMarkup(createElement(StepOptions, { file, mode: "sync", effectiveDate: FIXTURE_TODAY, levelName: "THCS", onMode: noop, onDate: noop }));
    for (const t of ["Thêm &amp; cập nhật", "Đồng bộ toàn bộ", "Ngày hiệu lực", "không có trong file"]) expect(html).toContain(t);
  });

  it("preview step (sync, conflict) and done step", () => {
    const missing = ds.students.filter((s) => s.id === FIXTURE_STUDENT_IDS.dat);
    const preview: StudentImportPreview = {
      previewHash: "hash-12345678",
      summary: { NEW: 1, UPDATE: 0, TRANSFER: 1, REINSTATE: 0, UNCHANGED: 0, INVALID: 1, total: 3, missing: 1 },
      rows: [
        { rowNumber: 5, id: "26069901", name: "Nguyễn Văn An", classCode: "6A01", kind: "NEW", changes: [], errors: [] },
        { rowNumber: 6, id: "26060101", name: "Nguyễn Trường Phúc", classCode: "6A02", kind: "TRANSFER", changes: ["Lớp: 6A01 → 6A02"], errors: [] },
        { rowNumber: 7, id: "26069902", name: "Lê Bình", classCode: "9Z9", kind: "INVALID", changes: [], errors: ["Lớp 9Z9 không tồn tại"] },
      ],
      missing,
    };
    const html = renderToStaticMarkup(
      createElement(StepPreview, {
        preview,
        mode: "sync",
        effectiveDate: FIXTURE_TODAY,
        filter: "CHANGES",
        query: "",
        applyMissing: false,
        conflict: true,
        onFilter: noop,
        onQuery: noop,
        onApplyMissing: noop,
      }),
    );
    for (const t of ["Dữ liệu học sinh vừa thay đổi", "Tuyển mới", "Chuyển lớp", "Lỗi", "Không có trong file", "Lớp: 6A01 → 6A02", "Lớp 9Z9 không tồn tại", "Đỗ Văn Đạt", "Đánh dấu 1 học sinh này là Đã chuyển trường"]) {
      expect(html).toContain(t);
    }
    const done = renderToStaticMarkup(createElement(StepDone, { result: { created: 1, updated: 0, transferred: 1, reinstated: 0, withdrawn: 1, skipped: 1 }, fileName: "ds.xlsx" }));
    for (const t of ["Đã cập nhật danh sách học sinh", "3 học sinh đã được cập nhật", "Thêm mới", "Bỏ qua"]) expect(done).toContain(t);
  });
});
