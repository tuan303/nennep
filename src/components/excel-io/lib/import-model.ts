/**
 * Workbook import wizard view model (FR-XLS-001/002, IO-01..12): section counts, options, request trimming,
 * preview summaries, issue filters / export rows and error classification. Pure – no React.
 */
import { ApiClientError } from "@/lib/client/api-errors";
import type { RowSeverity, WorkbookCommitResult, WorkbookImportOptions, WorkbookPayload, WorkbookPreview, WorkbookRowReport, WorkbookSectionSummary } from "@/lib/contract";

export type SectionKey = keyof WorkbookPreview["sections"];
export type ImportOptions = Required<WorkbookImportOptions>;
export type OptionKey = keyof ImportOptions;
export type IssueSheet = WorkbookRowReport["sheet"];

export const SECTION_ORDER: readonly SectionKey[] = ["classes", "catalog", "config", "weeks", "students", "incidents", "links", "rewards"];

export const SECTION_LABELS: Record<SectionKey, string> = {
  classes: "Lớp & GVCN",
  catalog: "Bảng điểm lỗi",
  config: "Cấu hình",
  weeks: "Lịch tuần",
  students: "Học sinh",
  incidents: "Sự việc",
  links: "HS liên quan",
  rewards: "Điểm thưởng",
};

/** Sheet of the workbook each section is read from. */
export const SECTION_SHEETS: Record<SectionKey, IssueSheet> = {
  classes: "Danh mục",
  catalog: "Bảng điểm lỗi",
  config: "Cấu hình",
  weeks: "Lịch tuần",
  students: "DS Học sinh",
  incidents: "Nhập liệu",
  links: "HS liên quan",
  rewards: "Điểm thưởng",
};

export const SHEET_ORDER: readonly IssueSheet[] = ["Nhập liệu", "HS liên quan", "DS Học sinh", "Danh mục", "Bảng điểm lỗi", "Cấu hình", "Lịch tuần", "Điểm thưởng"];

export interface OptionDef {
  key: OptionKey;
  label: string;
  description: string;
  /** Payload sections controlled by this option. */
  sections: SectionKey[];
  /** Overwrites approved settings – off by default, needs an explicit choice (IO-04/IO-06). */
  danger?: boolean;
}

export const OPTION_DEFS: readonly OptionDef[] = [
  { key: "classes", label: "Lớp & GVCN", description: "Danh mục lớp, GVCN, phó CN, sĩ số.", sections: ["classes"] },
  { key: "catalog", label: "Bảng điểm lỗi", description: "Mã lỗi, mảng, mức trừ và đơn vị tính.", sections: ["catalog"] },
  { key: "weeks", label: "Lịch tuần", description: "Các tuần học, tháng và học kỳ.", sections: ["weeks"] },
  { key: "students", label: "Học sinh", description: "Danh sách học sinh theo lớp.", sections: ["students"] },
  { key: "incidents", label: "Sự việc (+ HS liên quan)", description: "Sự việc nền nếp và học sinh liên quan.", sections: ["incidents", "links"] },
  { key: "rewards", label: "Điểm thưởng", description: "Điểm thưởng của tập thể lớp.", sections: ["rewards"] },
  { key: "config", label: "Cấu hình", description: "Điểm nền mỗi tuần, tuần bắt đầu, ngày học kỳ.", sections: ["config"], danger: true },
];

/** Rows per section in the parsed file ("config" = 1 when the sheet has at least one value). */
export function payloadCounts(p: WorkbookPayload): Record<SectionKey, number> {
  const configValues = p.config ? Object.values(p.config).filter((v) => v !== undefined && v !== "").length : 0;
  return {
    classes: p.classes.length,
    catalog: p.catalog.length,
    config: configValues > 0 ? 1 : 0,
    weeks: p.weeks.length,
    students: p.students.length,
    incidents: p.incidents.length,
    links: p.links.length,
    rewards: p.rewards.length,
  };
}

export function optionCount(def: OptionDef, counts: Record<SectionKey, number>): number {
  return counts[def.sections[0]];
}

/** Every section that has data is selected, except "Cấu hình" (never overwrite approved config by default). */
export function defaultOptions(p: WorkbookPayload): ImportOptions {
  const c = payloadCounts(p);
  return {
    classes: c.classes > 0,
    catalog: c.catalog > 0,
    config: false,
    weeks: c.weeks > 0,
    students: c.students > 0,
    incidents: c.incidents > 0,
    rewards: c.rewards > 0,
  };
}

export function optionsEqual(a: ImportOptions, b: ImportOptions): boolean {
  return OPTION_DEFS.every((d) => a[d.key] === b[d.key]);
}

export function anySelected(o: ImportOptions): boolean {
  return OPTION_DEFS.some((d) => o[d.key]);
}

export function isSectionSelected(key: SectionKey, o: ImportOptions): boolean {
  return key === "links" ? o.incidents : o[key];
}

/**
 * Request payload with unselected sections emptied (the server skips them anyway): keeps the request small
 * (4.5 MB limit). The same trimmed payload is sent to preview and commit, so the preview hash matches.
 */
export function requestPayload(p: WorkbookPayload, o: ImportOptions): WorkbookPayload {
  const out: WorkbookPayload = {
    ...p,
    classes: o.classes ? p.classes : [],
    catalog: o.catalog ? p.catalog : [],
    weeks: o.weeks ? p.weeks : [],
    students: o.students ? p.students : [],
    incidents: o.incidents ? p.incidents : [],
    links: o.incidents ? p.links : [],
    rewards: o.rewards ? p.rewards : [],
  };
  if (!o.config) delete out.config;
  return out;
}

/** Server body limit is 4.5 MB; keep a safety margin. */
export const MAX_REQUEST_BYTES = 4_400_000;

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export const TOO_LARGE_MESSAGE = "File quá lớn – hãy tách danh sách học sinh để nhập riêng ở Quản lý học sinh.";

/* --------------------------------- preview -------------------------------- */

export type Totals = Pick<WorkbookSectionSummary, "total" | "ok" | "warning" | "error" | "willCreate" | "willUpdate" | "willSkip">;

const ZERO: Totals = { total: 0, ok: 0, warning: 0, error: 0, willCreate: 0, willUpdate: 0, willSkip: 0 };

/** Totals over the selected sections. */
export function previewTotals(preview: WorkbookPreview, o: ImportOptions): Totals {
  const t = { ...ZERO };
  for (const key of SECTION_ORDER) {
    if (!isSectionSelected(key, o)) continue;
    const s = preview.sections[key];
    if (!s) continue;
    t.total += s.total;
    t.ok += s.ok;
    t.warning += s.warning;
    t.error += s.error;
    t.willCreate += s.willCreate;
    t.willUpdate += s.willUpdate;
    t.willSkip += s.willSkip;
  }
  return t;
}

export interface SectionRow {
  key: SectionKey;
  label: string;
  sheet: IssueSheet;
  selected: boolean;
  /** Rows found in the file. */
  fileCount: number;
  summary: WorkbookSectionSummary;
}

/** One row per section that has data in the file (unselected ones are listed as "Không nhập"). */
export function previewSectionRows(preview: WorkbookPreview, o: ImportOptions, counts: Record<SectionKey, number>): SectionRow[] {
  return SECTION_ORDER.filter((key) => counts[key] > 0 || isSectionSelected(key, o)).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    sheet: SECTION_SHEETS[key],
    selected: isSectionSelected(key, o),
    fileCount: counts[key],
    summary: preview.sections[key] ?? { ...ZERO },
  }));
}

export interface IssueFilter {
  sheet: IssueSheet | "ALL";
  severity: RowSeverity | "ALL";
}

export function filterIssues(issues: readonly WorkbookRowReport[], f: IssueFilter): WorkbookRowReport[] {
  return issues.filter((i) => (f.sheet === "ALL" || i.sheet === f.sheet) && (f.severity === "ALL" || i.severity === f.severity));
}

/** Sheets that have issues, in workbook order. */
export function issueSheets(issues: readonly WorkbookRowReport[]): IssueSheet[] {
  const present = new Set(issues.map((i) => i.sheet));
  return SHEET_ORDER.filter((s) => present.has(s));
}

export function severityCounts(issues: readonly WorkbookRowReport[]): Record<RowSeverity, number> {
  const out: Record<RowSeverity, number> = { OK: 0, WARNING: 0, ERROR: 0 };
  for (const i of issues) out[i.severity] += 1;
  return out;
}

/** Errors first, then workbook sheet order, then row number. */
export function sortIssues(issues: readonly WorkbookRowReport[]): WorkbookRowReport[] {
  const sev: Record<RowSeverity, number> = { ERROR: 0, WARNING: 1, OK: 2 };
  return [...issues].sort(
    (a, b) => sev[a.severity] - sev[b.severity] || SHEET_ORDER.indexOf(a.sheet) - SHEET_ORDER.indexOf(b.sheet) || a.rowNumber - b.rowNumber,
  );
}

export const SEVERITY_LABELS: Record<RowSeverity, string> = { OK: "Hợp lệ", WARNING: "Cảnh báo", ERROR: "Lỗi" };

export const ISSUE_EXPORT_COLUMNS = [
  { header: "Trang", key: "sheet", width: 16 },
  { header: "Dòng", key: "row", width: 8 },
  { header: "Khóa", key: "key", width: 22 },
  { header: "Mức độ", key: "severity", width: 12 },
  { header: "Nội dung", key: "messages", width: 80 },
  { header: "Điểm trong file", key: "pointsInFile", width: 14 },
  { header: "Điểm theo quy định", key: "computedPoints", width: 16 },
];

export function issueExportRows(issues: readonly WorkbookRowReport[]): Array<Record<string, string | number | null>> {
  return sortIssues(issues).map((i) => ({
    sheet: i.sheet,
    row: i.rowNumber,
    key: i.key,
    severity: SEVERITY_LABELS[i.severity],
    messages: i.messages.join(" · "),
    pointsInFile: i.pointsInFile ?? null,
    computedPoints: i.computedPoints ?? null,
  }));
}

/* --------------------------------- commit --------------------------------- */

export interface CommitRow {
  key: string;
  label: string;
  created: number;
  updated: number;
  skipped: number;
}

export function commitRows(r: WorkbookCommitResult): CommitRow[] {
  const keys = new Set([...Object.keys(r.created), ...Object.keys(r.updated), ...Object.keys(r.skipped)]);
  const known = SECTION_ORDER.filter((k) => keys.has(k));
  const extra = [...keys].filter((k) => !(SECTION_ORDER as readonly string[]).includes(k)).sort();
  return [...known, ...extra]
    .map((key) => ({
      key,
      label: (SECTION_LABELS as Record<string, string>)[key] ?? key,
      created: r.created[key] ?? 0,
      updated: r.updated[key] ?? 0,
      skipped: r.skipped[key] ?? 0,
    }))
    .filter((row) => row.created + row.updated + row.skipped > 0);
}

/* --------------------------------- errors --------------------------------- */

export type ImportErrorKind = "conflict" | "tooLarge" | "forbidden" | "other";

/** 409 = data changed since the preview (re-run it); 413 = request too large. */
export function classifyImportError(err: unknown): ImportErrorKind {
  if (!(err instanceof ApiClientError)) return "other";
  if (err.status === 409) return "conflict";
  if (err.status === 413) return "tooLarge";
  if (err.status === 403) return "forbidden";
  return "other";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
