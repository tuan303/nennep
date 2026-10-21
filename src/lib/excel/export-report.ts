/**
 * Small report exports (one styled sheet each) + the HTML snapshot re-export.
 * All return raw .xlsx bytes (browser: `downloadBlob(bytes, name, MIME.xlsx)`; Node: `Buffer.from(bytes)`).
 */
import { SCHOOL_NAME } from "../constants";
import { formatDateVN, isIsoDate, todayVN } from "../engine/dates";
import type { Incident } from "../types";
import { catalogChoiceText } from "./format";
import { createWorkbook, workbookToBytes } from "./loader";
import { rankingColumns, sortRanking, STUDENT_REPORT_COLUMNS, type RankingExportRow, type StudentExportRow } from "./report-columns";
import { addTableSheet, XL_COLORS, type ColumnKind, type TableColumn } from "./sheet-writer";

export { buildHtmlSnapshot, type HtmlSnapshotInput } from "./html-snapshot";

export interface SimpleColumn {
  header: string;
  key: string;
  width?: number;
}

export type SimpleRow = Record<string, string | number | null>;

export interface SimpleSheetOptions {
  /** row 2 text; default "Trường Ngôi Sao Hoàng Mai · Xuất ngày dd/mm/yyyy" */
  subtitle?: string;
  /** default: the title (sanitised, ≤ 31 chars) */
  sheetName?: string;
}

function inferKind(values: ReadonlyArray<string | number | null>): ColumnKind {
  const filled = values.filter((v): v is string | number => v !== null && v !== "");
  if (filled.length === 0) return "text";
  if (filled.every((v) => typeof v === "number")) return "number";
  if (filled.every((v) => typeof v === "string" && isIsoDate(v))) return "date";
  return filled.some((v) => String(v).length > 50 || String(v).includes("\n")) ? "wrap" : "text";
}

function autoWidth(header: string, values: ReadonlyArray<string | number | null>, kind: ColumnKind): number {
  if (kind === "date") return 12;
  const longest = values.slice(0, 300).reduce<number>((m, v) => Math.max(m, v === null ? 0 : String(v).length), header.length);
  return Math.min(kind === "wrap" ? 50 : 40, Math.max(8, longest + 2));
}

function defaultSubtitle(): string {
  return `${SCHOOL_NAME} · Xuất ngày ${formatDateVN(todayVN())}`;
}

/** Generic styled one-sheet export (title row 1, header row 4, data from row 5). ISO date strings become real dates. */
export async function exportSimpleSheet(title: string, columns: SimpleColumn[], rows: SimpleRow[], opts: SimpleSheetOptions = {}): Promise<Uint8Array> {
  const wb = await createWorkbook();
  wb.title = title;
  const tableColumns: TableColumn<SimpleRow>[] = columns.map((c) => {
    const values = rows.map((r) => r[c.key] ?? null);
    const kind = inferKind(values);
    return { header: c.header, width: c.width ?? autoWidth(c.header, values, kind), kind, value: (r) => r[c.key] ?? null };
  });
  addTableSheet(wb, {
    name: opts.sheetName ?? title,
    title,
    subtitle: opts.subtitle ?? defaultSubtitle(),
    columns: tableColumns,
    items: rows,
    tabColor: XL_COLORS.navy,
  });
  return workbookToBytes(wb);
}

export interface ReportContext {
  levelName: string; // "Trung học cơ sở"
  periodLabel: string; // "Tháng 10/2026"
  today: string; // yyyy-mm-dd
  /** config.top90Ratio of the level (default 0.9) – names the Top column. */
  topRatio?: number;
}

function reportSubtitle(ctx: ReportContext): string {
  return `${SCHOOL_NAME} · ${ctx.levelName} · ${ctx.periodLabel} · Xuất ngày ${formatDateVN(ctx.today)}`;
}

/** Ranking of every class (flatten `GradeRanking[]` with `grades.flatMap(g => g.rows)`). */
export async function exportRankingSheet(rows: RankingExportRow[], ctx: ReportContext): Promise<Uint8Array> {
  const wb = await createWorkbook();
  addTableSheet(wb, {
    name: "Xếp hạng",
    title: `XẾP HẠNG THI ĐUA – ${ctx.levelName.toLocaleUpperCase("vi-VN")}`,
    subtitle: `${reportSubtitle(ctx)} · Xếp hạng trong từng khối.`,
    columns: rankingColumns(ctx.topRatio),
    items: sortRanking(rows),
    freezeColumns: 2,
    tabColor: XL_COLORS.gold,
  });
  return workbookToBytes(wb);
}

/** Students with incidents in the period (Học sinh screen). */
export async function exportStudentList(rows: StudentExportRow[], ctx: ReportContext): Promise<Uint8Array> {
  const wb = await createWorkbook();
  addTableSheet(wb, {
    name: "Học sinh",
    title: `HỌC SINH CÓ SỰ VIỆC – ${ctx.levelName.toLocaleUpperCase("vi-VN")}`,
    subtitle: `${reportSubtitle(ctx)} · Chỉ dùng để tổng hợp hỗ trợ.`,
    columns: STUDENT_REPORT_COLUMNS,
    items: rows,
    freezeColumns: 2,
    tabColor: XL_COLORS.royal,
  });
  return workbookToBytes(wb);
}

/** "Nguyễn A, Trần B + 2 HS chưa rõ tên" or "Tập thể lớp". */
export function incidentSubjects(inc: Pick<Incident, "students" | "unnamedCount">): string {
  const names = inc.students.map((s) => s.name).join(", ");
  const unnamed = inc.unnamedCount > 0 ? `${inc.unnamedCount} HS chưa rõ tên` : "";
  if (names && unnamed) return `${names} + ${unnamed}`;
  return names || unnamed || "Tập thể lớp";
}

const GVCN_COLUMNS: ReadonlyArray<TableColumn<Incident>> = [
  { header: "Ngày", width: 12, kind: "date", value: (i) => i.date },
  { header: "Mã sự việc", width: 19, value: (i) => i.code },
  { header: "Đối tượng", width: 30, kind: "wrap", value: incidentSubjects },
  { header: "Lỗi", width: 44, kind: "wrap", value: (i) => catalogChoiceText({ ...i, code: i.errorCode }) },
  { header: "Điểm trừ", width: 9, kind: "number", value: (i) => i.points, look: () => ({ font: { bold: true } }) },
  { header: "Chi tiết", width: 36, kind: "wrap", value: (i) => i.detail },
  { header: "Trạng thái", width: 14, value: (i) => i.status },
  { header: "Phản hồi GVCN", width: 36, kind: "wrap", value: (i) => i.gvcnNote },
];

/** Báo GVCN: incidents of one class in the period, oldest first. */
export async function exportGvcnReport(input: ReportContext & { classCode: string; homeroomTeacher?: string; incidents: Incident[] }): Promise<Uint8Array> {
  const wb = await createWorkbook();
  const items = [...input.incidents].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  const total = items.reduce((s, i) => s + i.points, 0);
  const teacher = input.homeroomTeacher ? ` · GVCN: ${input.homeroomTeacher}` : "";
  addTableSheet(wb, {
    name: `Lớp ${input.classCode}`,
    title: `BÁO CÁO NỀN NẾP LỚP ${input.classCode}`,
    subtitle: `${reportSubtitle(input)}${teacher} · ${items.length} sự việc, tổng điểm trừ ${Math.round(total * 100) / 100}.`,
    columns: GVCN_COLUMNS,
    items,
    freezeColumns: 1,
    tabColor: XL_COLORS.navy,
  });
  return workbookToBytes(wb);
}
