import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/client/api-errors";
import type { WorkbookPayload, WorkbookPreview, WorkbookRowReport, WorkbookSectionSummary } from "@/lib/contract";
import {
  MAX_REQUEST_BYTES,
  classifyImportError,
  commitRows,
  defaultOptions,
  filterIssues,
  formatBytes,
  issueExportRows,
  issueSheets,
  jsonBytes,
  optionsEqual,
  payloadCounts,
  previewSectionRows,
  previewTotals,
  requestPayload,
  severityCounts,
  sortIssues,
} from "../lib/import-model";

const payload: WorkbookPayload = {
  levelId: "THCS",
  sourceFileName: "NN_THCS.xlsx",
  classes: [{ code: "6A01", grade: 6 }],
  catalog: [{ code: "L01", category: "Chuyên cần", issue: "Đi học muộn", penalty: 2, unit: "/HS" }],
  config: { baseScorePerWeek: 100 },
  weeks: [{ weekStart: "2026-09-07", month: "2026-09", semester: "HK1" }],
  students: [
    { id: "1", name: "An", classCode: "6A01" },
    { id: "2", name: "Bình", classCode: "6A01" },
  ],
  incidents: [{ rowNumber: 5, code: "", date: "2026-09-08", classCode: "6A01", errorCode: "L01" }],
  links: [{ rowNumber: 5, incidentCode: "x", studentId: "1" }],
  rewards: [],
};

const sum = (s: Partial<WorkbookSectionSummary>): WorkbookSectionSummary => ({ total: 0, ok: 0, warning: 0, error: 0, willCreate: 0, willUpdate: 0, willSkip: 0, ...s });

const preview: WorkbookPreview = {
  levelId: "THCS",
  previewHash: "abcdef123456",
  sections: {
    classes: sum({ total: 1, ok: 1, willUpdate: 1 }),
    catalog: sum({ total: 1, ok: 1, willSkip: 1 }),
    config: sum({}),
    weeks: sum({ total: 1, ok: 1, willCreate: 1 }),
    students: sum({ total: 2, ok: 1, warning: 1, willCreate: 2 }),
    incidents: sum({ total: 1, error: 1, willSkip: 1 }),
    links: sum({ total: 1, warning: 1, willSkip: 1 }),
    rewards: sum({}),
  },
  issues: [],
};

const issues: WorkbookRowReport[] = [
  { sheet: "HS liên quan", rowNumber: 5, key: "x", severity: "WARNING", messages: ["Không tìm thấy học sinh"] },
  { sheet: "Nhập liệu", rowNumber: 9, key: "NN-1", severity: "ERROR", messages: ["Lớp không có", "Ngày trống"], pointsInFile: 4, computedPoints: 2 },
  { sheet: "Nhập liệu", rowNumber: 5, key: "NN-0", severity: "WARNING", messages: ["Lệch điểm"] },
];

describe("payload and options", () => {
  it("counts rows per section", () => {
    expect(payloadCounts(payload)).toEqual({ classes: 1, catalog: 1, config: 1, weeks: 1, students: 2, incidents: 1, links: 1, rewards: 0 });
    expect(payloadCounts({ ...payload, config: {} }).config).toBe(0);
  });

  it("selects sections with data, never the config by default", () => {
    const o = defaultOptions(payload);
    expect(o).toEqual({ classes: true, catalog: true, config: false, weeks: true, students: true, incidents: true, rewards: false });
    expect(optionsEqual(o, { ...o })).toBe(true);
    expect(optionsEqual(o, { ...o, config: true })).toBe(false);
  });

  it("empties unselected sections in the request", () => {
    const o = { ...defaultOptions(payload), students: false, incidents: false };
    const req = requestPayload(payload, o);
    expect(req.students).toEqual([]);
    expect(req.incidents).toEqual([]);
    expect(req.links).toEqual([]);
    expect(req.classes).toHaveLength(1);
    expect("config" in req).toBe(false);
    expect(requestPayload(payload, { ...o, config: true }).config).toEqual({ baseScorePerWeek: 100 });
    expect(jsonBytes(req)).toBeLessThan(jsonBytes(payload));
    expect(jsonBytes({ s: "Đ" })).toBe(10);
    expect(MAX_REQUEST_BYTES).toBeLessThan(4_500_000);
  });
});

describe("preview summaries", () => {
  it("adds up the selected sections only", () => {
    const o = defaultOptions(payload);
    expect(previewTotals(preview, o)).toEqual({ total: 7, ok: 4, warning: 2, error: 1, willCreate: 3, willUpdate: 1, willSkip: 3 });
    expect(previewTotals(preview, { ...o, incidents: false }).error).toBe(0);
  });

  it("lists sections that have data, marking unselected ones", () => {
    const rows = previewSectionRows(preview, { ...defaultOptions(payload), students: false }, payloadCounts(payload));
    expect(rows.map((r) => r.key)).toEqual(["classes", "catalog", "config", "weeks", "students", "incidents", "links"]);
    expect(rows.find((r) => r.key === "students")?.selected).toBe(false);
    expect(rows.find((r) => r.key === "config")?.selected).toBe(false);
    expect(rows.find((r) => r.key === "links")?.sheet).toBe("HS liên quan");
  });

  it("filters, sorts and exports issues", () => {
    expect(filterIssues(issues, { sheet: "Nhập liệu", severity: "ALL" })).toHaveLength(2);
    expect(filterIssues(issues, { sheet: "ALL", severity: "WARNING" })).toHaveLength(2);
    expect(issueSheets(issues)).toEqual(["Nhập liệu", "HS liên quan"]);
    expect(severityCounts(issues)).toEqual({ OK: 0, WARNING: 2, ERROR: 1 });
    expect(sortIssues(issues).map((i) => i.key)).toEqual(["NN-1", "NN-0", "x"]);
    const rows = issueExportRows(issues);
    expect(rows[0]).toEqual({ sheet: "Nhập liệu", row: 9, key: "NN-1", severity: "Lỗi", messages: "Lớp không có · Ngày trống", pointsInFile: 4, computedPoints: 2 });
    expect(rows[1].pointsInFile).toBeNull();
  });
});

describe("commit and errors", () => {
  it("lists sections that changed", () => {
    const rows = commitRows({ batchId: "b1", created: { incidents: 3, students: 0 }, updated: { classes: 2 }, skipped: { incidents: 1, misc: 4 }, review: 1 });
    expect(rows.map((r) => r.key)).toEqual(["classes", "incidents", "misc"]);
    expect(rows[1]).toEqual({ key: "incidents", label: "Sự việc", created: 3, updated: 0, skipped: 1 });
  });

  it("classifies API errors", () => {
    expect(classifyImportError(new ApiClientError(409, "CONFLICT", "Dữ liệu đã thay đổi"))).toBe("conflict");
    expect(classifyImportError(new ApiClientError(413, "VALIDATION", "Quá lớn"))).toBe("tooLarge");
    expect(classifyImportError(new ApiClientError(403, "FORBIDDEN", "Không có quyền"))).toBe("forbidden");
    expect(classifyImportError(new Error("x"))).toBe("other");
    expect(formatBytes(2_500_000)).toBe("2,4 MB");
    expect(formatBytes(2048)).toBe("2 KB");
  });
});
