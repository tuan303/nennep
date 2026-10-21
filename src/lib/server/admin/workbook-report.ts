/**
 * Preview bookkeeping for the workbook import: per-section tallies (OK / WARNING / ERROR, create / update / skip)
 * and the list of WARNING/ERROR rows shown to the admin (IO-09).
 */
import type { RowSeverity, WorkbookPreview, WorkbookRowReport, WorkbookSectionSummary } from "../../contract";

export type SectionKey = keyof WorkbookPreview["sections"];
export const SECTION_KEYS: SectionKey[] = ["classes", "catalog", "config", "weeks", "students", "incidents", "links", "rewards"];

export type RowAction = "create" | "update" | "skip";

export const SHEET: Record<SectionKey, WorkbookRowReport["sheet"]> = {
  classes: "Danh mục",
  catalog: "Bảng điểm lỗi",
  config: "Cấu hình",
  weeks: "Lịch tuần",
  students: "DS Học sinh",
  incidents: "Nhập liệu",
  links: "HS liên quan",
  rewards: "Điểm thưởng",
};

function emptySummary(): WorkbookSectionSummary {
  return { total: 0, ok: 0, warning: 0, error: 0, willCreate: 0, willUpdate: 0, willSkip: 0 };
}

export interface RowInput {
  rowNumber: number;
  key: string;
  /** ERROR rows are never written; non-empty `warnings` make the row a WARNING. */
  errors?: string[];
  warnings?: string[];
  action: RowAction;
  computedPoints?: number;
  pointsInFile?: number;
}

export class ImportReport {
  readonly sections: Record<SectionKey, WorkbookSectionSummary>;
  readonly issues: WorkbookRowReport[] = [];

  constructor() {
    this.sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, emptySummary()])) as Record<SectionKey, WorkbookSectionSummary>;
  }

  /** Record one source row. Returns its severity. */
  row(section: SectionKey, r: RowInput): RowSeverity {
    const errors = r.errors ?? [];
    const warnings = r.warnings ?? [];
    const severity: RowSeverity = errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "OK";
    const action: RowAction = severity === "ERROR" ? "skip" : r.action;
    const s = this.sections[section];
    s.total++;
    if (severity === "OK") s.ok++;
    else if (severity === "WARNING") s.warning++;
    else s.error++;
    if (action === "create") s.willCreate++;
    else if (action === "update") s.willUpdate++;
    else s.willSkip++;
    if (severity !== "OK") {
      const issue: WorkbookRowReport = { sheet: SHEET[section], rowNumber: r.rowNumber, key: r.key, severity, messages: [...errors, ...warnings] };
      if (r.computedPoints !== undefined) issue.computedPoints = r.computedPoints;
      if (r.pointsInFile !== undefined) issue.pointsInFile = r.pointsInFile;
      this.issues.push(issue);
    }
    return severity;
  }

  /** A whole section that the admin chose not to import: every row is skipped silently. */
  skipAll(section: SectionKey, count: number): void {
    const s = this.sections[section];
    s.total += count;
    s.ok += count;
    s.willSkip += count;
  }
}
