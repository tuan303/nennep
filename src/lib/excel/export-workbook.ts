/**
 * exportLevelWorkbook – the whole level as a styled .xlsx in the legacy NSHM layout (re-importable):
 * Nhập liệu · HS liên quan · DS Học sinh · Danh mục · Bảng điểm lỗi · Cấu hình · Lịch tuần · Điểm thưởng
 * (+ Xếp hạng and BC Học sinh when rows are supplied). Returns raw bytes:
 * browser → `downloadBlob(bytes, name, MIME.xlsx)`; Node → `Buffer.from(bytes)`.
 */
import { SCHOOL_NAME } from "../constants";
import { formatDateVN } from "../engine/dates";
import type { ClassInfo, LevelDataset } from "../types";
import {
  CATALOG_COLUMNS,
  CLASS_COLUMNS,
  CONFIG_COLUMNS,
  configRows,
  INCIDENT_COLUMNS,
  LINK_COLUMNS,
  REWARD_COLUMNS,
  STUDENT_COLUMNS,
  WEEK_COLUMNS,
  type IncidentRow,
  type LinkRow,
} from "./level-sheets";
import { createWorkbook, workbookToBytes } from "./loader";
import { rankingColumns, sortRanking, STUDENT_REPORT_COLUMNS, type RankingExportRow, type StudentExportRow } from "./report-columns";
import { topGroupLabel } from "./format";
import { addTableSheet, XL_COLORS } from "./sheet-writer";

export interface ExportWorkbookOptions {
  /** yyyy-mm-dd (VN) – shown in subtitles */
  today: string;
  /** e.g. "Trung học cơ sở" (LEVELS[levelId].name) */
  levelName: string;
  /** adds the "Xếp hạng" sheet (e.g. `buildRanking(...).grades.flatMap(g => g.rows)`) */
  rankingRows?: RankingExportRow[];
  /** adds the "BC Học sinh" sheet */
  studentRows?: StudentExportRow[];
  /** e.g. "Tháng 10/2026" – shown on Xếp hạng / BC Học sinh */
  periodLabel?: string;
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, "vi");

export async function exportLevelWorkbook(ds: LevelDataset, opts: ExportWorkbookOptions): Promise<Uint8Array> {
  const wb = await createWorkbook();
  wb.title = `Nền nếp ${opts.levelName} – năm học ${ds.config.schoolYear}`;
  const LEVEL = opts.levelName.toLocaleUpperCase("vi-VN");
  const base = `${SCHOOL_NAME} · ${opts.levelName} · Năm học ${ds.config.schoolYear} · Xuất ngày ${formatDateVN(opts.today)}`;
  const period = opts.periodLabel ? ` · ${opts.periodLabel}` : "";

  const classByCode = new Map<string, ClassInfo>(ds.classes.map((c) => [c.code, c]));
  const classOrder = new Map<string, number>(ds.classes.map((c) => [c.code, c.order]));
  const orderOf = (code: string) => classOrder.get(code) ?? Number.MAX_SAFE_INTEGER;

  const incidents = [...ds.incidents].sort((a, b) => a.date.localeCompare(b.date) || byCode(a, b));
  const incidentRows: IncidentRow[] = incidents.map((inc) => ({ inc, cls: classByCode.get(inc.classCode) }));
  addTableSheet(wb, {
    name: "Nhập liệu",
    title: `NHẬP LIỆU SỰ VIỆC NỀN NẾP – ${LEVEL} (${ds.levelId})`,
    subtitle: `${base} · Một dòng = một sự việc; học sinh liên quan ở trang “HS liên quan”.${ds.redacted ? " Thông tin học sinh của lớp khác đã được ẩn." : ""}`,
    columns: INCIDENT_COLUMNS,
    items: incidentRows,
    freezeColumns: 3,
    tabColor: XL_COLORS.gold,
  });

  const links: LinkRow[] = incidents.flatMap((inc) =>
    inc.students.map((s) => ({ incidentCode: inc.code, incidentClass: inc.classCode, name: s.name, id: s.id, classCode: s.classCode })),
  );
  addTableSheet(wb, {
    name: "HS liên quan",
    title: "HỌC SINH LIÊN QUAN ĐẾN SỰ VIỆC",
    subtitle: `${base} · Mỗi dòng = một học sinh của một sự việc.`,
    columns: LINK_COLUMNS,
    items: links,
    freezeColumns: 1,
    tabColor: XL_COLORS.gold,
  });

  const students = [...ds.students].sort(
    (a, b) => orderOf(a.classCode) - orderOf(b.classCode) || a.classCode.localeCompare(b.classCode, "vi") || a.name.localeCompare(b.name, "vi"),
  );
  addTableSheet(wb, {
    name: "DS Học sinh",
    title: `DANH SÁCH HỌC SINH – ${LEVEL}`,
    subtitle: `${base} · ${students.length} học sinh.`,
    columns: STUDENT_COLUMNS,
    items: students,
    freezeColumns: 2,
    tabColor: XL_COLORS.royal,
  });

  const activeByClass = new Map<string, number>();
  for (const s of ds.students) if (s.status === "ACTIVE") activeByClass.set(s.classCode, (activeByClass.get(s.classCode) ?? 0) + 1);
  const classes = [...ds.classes].sort((a, b) => a.order - b.order || byCode(a, b));
  addTableSheet(wb, {
    name: "Danh mục",
    title: `DANH MỤC LỚP – ${LEVEL} (${ds.levelId})`,
    subtitle: `${base} · ${classes.length} lớp.`,
    columns: CLASS_COLUMNS,
    items: classes.map((cls) => ({ cls, activeStudents: activeByClass.get(cls.code) ?? 0 })),
    freezeColumns: 1,
    tabColor: XL_COLORS.navy,
  });

  const catalog = [...ds.catalog].sort(byCode);
  addTableSheet(wb, {
    name: "Bảng điểm lỗi",
    title: `BẢNG ĐIỂM LỖI THI ĐUA – ${catalog.length} LỖI`,
    subtitle: `${base} · Mã lỗi được giữ ở cuối lựa chọn để hệ thống nhận diện.`,
    columns: CATALOG_COLUMNS,
    items: catalog,
    freezeColumns: 1,
    tabColor: XL_COLORS.navy,
  });

  addTableSheet(wb, {
    name: "Cấu hình",
    title: `CẤU HÌNH THI ĐUA – ${LEVEL}`,
    subtitle: base,
    columns: CONFIG_COLUMNS,
    items: configRows(ds.config),
    tabColor: XL_COLORS.navy,
  });

  addTableSheet(wb, {
    name: "Lịch tuần",
    title: `LỊCH TUẦN TÍNH THI ĐUA – NĂM HỌC ${ds.config.schoolYear}`,
    subtitle: `${base} · Tuần thuộc tháng/học kỳ theo ngày Thứ Hai.`,
    columns: WEEK_COLUMNS,
    items: [...ds.weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    tabColor: XL_COLORS.navy,
  });

  addTableSheet(wb, {
    name: "Điểm thưởng",
    title: `ĐIỂM THƯỞNG THI ĐUA – ${LEVEL}`,
    subtitle: `${base} · Chỉ điểm thưởng ở trạng thái ${ds.config.rewardCountedStatuses.join(", ")} được tính vào xếp hạng.`,
    columns: REWARD_COLUMNS,
    items: [...ds.rewards].sort((a, b) => a.date.localeCompare(b.date) || byCode(a, b)),
    freezeColumns: 1,
    tabColor: XL_COLORS.ok,
  });

  if (opts.rankingRows) {
    addTableSheet(wb, {
      name: "Xếp hạng",
      title: `XẾP HẠNG THI ĐUA – ${LEVEL}`,
      subtitle: `${base}${period} · Xếp hạng trong từng khối; ${topGroupLabel(ds.config.top90Ratio)} tính theo số lớp của khối.`,
      columns: rankingColumns(ds.config.top90Ratio),
      items: sortRanking(opts.rankingRows),
      freezeColumns: 2,
      tabColor: XL_COLORS.gold,
    });
  }

  if (opts.studentRows) {
    addTableSheet(wb, {
      name: "BC Học sinh",
      title: `BÁO CÁO HỌC SINH – ${LEVEL}`,
      subtitle: `${base}${period} · Chỉ dùng để tổng hợp hỗ trợ; không dùng để đánh giá chính thức học sinh khi thiếu dữ liệu/bằng chứng.`,
      columns: STUDENT_REPORT_COLUMNS,
      items: opts.studentRows,
      freezeColumns: 2,
      tabColor: XL_COLORS.royal,
    });
  }

  return workbookToBytes(wb);
}
