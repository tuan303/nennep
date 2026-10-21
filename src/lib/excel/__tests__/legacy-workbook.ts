/**
 * Synthetic workbooks in the three legacy NSHM "sổ nền nếp" layouts (Tiểu học / THCS / THPT), for parser and import tests.
 *
 * Sheet names, titles, header texts (line breaks, "(tự động)" hints), formula cells with cached results, number-typed ids
 * and phones mirror the real files, but EVERY value is invented: student ids start with 99, phones are 0900 00x xxx,
 * e-mails end with @example.test and names are "Học Sinh Mẫu …" / "Cô Giáo Mẫu …". Never copy values from data/seed –
 * it holds real students' personal data (git-ignored, see README).
 */
import ExcelJS from "exceljs";
import type { LevelId } from "../../types";

/* ------------------------------- shared data ------------------------------- */

type Row = Array<ExcelJS.CellValue>;

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** Formula cell; `result` undefined = never calculated (file saved without cached values). */
const f = (formula: string, result?: string | number | Date): ExcelJS.CellFormulaValue =>
  (result === undefined ? { formula } : { formula, result }) as ExcelJS.CellFormulaValue;

const LEVEL_TITLE: Record<LevelId, string> = { TH: "TIỂU HỌC", THCS: "THCS", THPT: "THPT" };

const CAT_CC = "Chuyên cần – vệ sinh";
const CAT_HT = "Học tập – truy bài";

interface CatalogSpec {
  code: string;
  category: string;
  issue: string;
  group: string;
  penalty: number;
  unit: "/HS" | "/lần";
}

function catalogOf(level: LevelId): CatalogSpec[] {
  return [
    { code: "L01", category: CAT_CC, issue: "Đi học muộn", group: "Nhóm 1", penalty: 2, unit: "/HS" },
    { code: "L02", category: CAT_CC, issue: "Đồng phục không đúng quy định", group: "Nhóm 1", penalty: 2, unit: "/HS" },
    // The real catalogs differ per level: TH L03 = 5 /lần, THCS/THPT L03 = 2 /HS.
    level === "TH"
      ? { code: "L03", category: CAT_CC, issue: "Vệ sinh lớp học chưa sạch", group: "Nhóm 1", penalty: 5, unit: "/lần" }
      : { code: "L03", category: CAT_CC, issue: "Vi phạm quy định vệ sinh 5S trong khuôn viên trường, lớp học", group: "Nhóm 1", penalty: 2, unit: "/HS" },
    { code: "L04", category: CAT_CC, issue: "Giày dép để lộn xộn", group: "Nhóm 1", penalty: 2, unit: "/HS" },
    { code: "L10", category: CAT_HT, issue: "Không nộp sổ Nhật ký học tập", group: "Nhóm 3", penalty: 5, unit: "/lần" },
    { code: "L43", category: CAT_CC, issue: "Đi chân đất/ không đi giày dép", group: "Nhóm 1", penalty: 2, unit: "/lần" },
  ];
}

const choiceOf = (c: CatalogSpec) => `${c.issue} | ${c.category} | ${String(c.penalty).replace(".", ",")} điểm${c.unit} | ${c.code}`;

/* ------------------------------ expected values ---------------------------- */

/** What the parser must read back from each synthetic workbook (used by the tests' assertions). */
export const LEGACY_EXPECTED = {
  TH: { classes: 3, catalog: 6, students: 4, incidents: 4, links: 3 },
  THCS: { classes: 3, catalog: 6, students: 4, incidents: 7, links: 3 },
  THPT: { classes: 2, catalog: 6, students: 3, incidents: 4, links: 2 },
} as const satisfies Record<LevelId, Record<string, number>>;

/** Synthetic people referenced by the assertions. */
export const LEGACY_PEOPLE = {
  th: {
    firstStudent: { id: "99010001", name: "Học Sinh Mẫu An", dob: "2019-09-05", classCode: "1A1" },
    linked: { id: "99050001", name: "Học Sinh Mẫu Chi", dob: "2015-09-18", classCode: "5A6" },
    homeroom: { teacher: "Cô Giáo Mẫu Một", phone: "0900000001", email: "gvcn.1a1@example.test" },
  },
  thcs: {
    firstStudent: { id: "99060001", name: "HỌC SINH MẪU DŨNG", classCode: "6A0H", statusText: "Đang học" },
    linked: { id: "99090001", name: "HỌC SINH MẪU GIANG", classCode: "9I0" },
    homeroom6A0H: { teacher: "Cô Giáo Mẫu Hai", sourceSize: 29 },
    reporter: "Thầy Giám Thị Mẫu",
  },
  thpt: {
    linked: { id: "99120001", name: "HỌC SINH MẪU KHANH", classCode: "12L01" },
  },
} as const;

/* --------------------------------- helpers --------------------------------- */

function sheet(wb: ExcelJS.Workbook, name: string, title: string, note: string | undefined, headers: Row): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  ws.getCell("A1").value = title;
  if (note) ws.getCell("A2").value = note;
  ws.getRow(4).values = headers; // contiguous array: element 0 → column A
  return ws;
}

function putRows(ws: ExcelJS.Worksheet, rows: Row[], first = 5): void {
  rows.forEach((values, i) => {
    ws.getRow(first + i).values = values;
  });
}

const codeFormula = (r: number) => `IF(B${r}="","","NN-"&TEXT(B${r},"yyyymmdd")&"-"&TEXT(ROW()-4,"0000"))`;

/* ----------------------------- reference sheets ---------------------------- */

function addCatalog(wb: ExcelJS.Workbook, level: LevelId): void {
  const ws = sheet(wb, "Bảng điểm lỗi", `BẢNG ĐIỂM LỖI NỀN NẾP – ${LEVEL_TITLE[level]}`, "Mã lỗi được giữ ở cuối lựa chọn để hệ thống mapping.", [
    "Mã lỗi",
    "Mảng",
    "Nội dung lỗi",
    "Nhóm lỗi",
    "Mức trừ",
    "Đơn vị",
    "Lựa chọn lỗi (hiển thị khi nhập)",
  ]);
  putRows(ws, catalogOf(level).map((c) => [c.code, c.category, c.issue, c.group, c.penalty, c.unit, choiceOf(c)]));
}

function addConfig(wb: ExcelJS.Workbook, level: LevelId): void {
  const ws = sheet(wb, "Cấu hình", `CẤU HÌNH NỀN NẾP ${LEVEL_TITLE[level]}`, "Mốc thời gian dưới đây BGH có thể chỉnh.", ["Tham số", "Giá trị"]);
  putRows(ws, [
    ["Điểm cơ sở / lớp / tuần", 100],
    ["Tuần đầu tính thi đua", d("2026-08-17")],
    ["HK1 bắt đầu", d("2026-08-17")],
    ["HK1 kết thúc", d("2026-12-31")],
    ["HK2 bắt đầu", d("2027-01-01")],
    ["HK2 kết thúc", d("2027-05-31")],
    [],
    ["Quy tắc", "Mô tả"],
    ["Điểm tuần", "100 − Tổng điểm trừ."],
  ]);
}

/** 42 weeks from 2026-08-17; Tháng = 1st of the month (Date); Học kỳ = formula (TH/THPT) or plain text (THCS). */
function addWeeks(wb: ExcelJS.Workbook, level: LevelId): void {
  const ws = sheet(wb, "Lịch tuần", "LỊCH TUẦN TÍNH THI ĐUA", undefined, ["Tuần bắt đầu", "Tháng", "Học kỳ"]);
  const rows: Row[] = [];
  for (let i = 0; i < 42; i++) {
    const start = new Date(Date.UTC(2026, 7, 17 + 7 * i));
    const iso = start.toISOString().slice(0, 10);
    const sem = iso <= "2026-12-31" ? "HK1" : "HK2";
    const r = 5 + i;
    const semCell =
      level === "THCS" ? sem : f(`IF(AND(A${r}>='Cấu hình'!$B$7,A${r}<='Cấu hình'!$B$8),"HK1",IF(AND(A${r}>='Cấu hình'!$B$9,A${r}<='Cấu hình'!$B$10),"HK2",""))`, sem);
    rows.push([start, d(`${iso.slice(0, 7)}-01`), semCell]);
  }
  putRows(ws, rows);
}

/* ---------------------------------- TH ------------------------------------ */

function buildTH(wb: ExcelJS.Workbook): void {
  const cat = new Map(catalogOf("TH").map((c) => [c.code, c]));
  const inc = sheet(wb, "Nhập liệu", "NHẬP LIỆU SỰ VIỆC NỀN NẾP – TIỂU HỌC", "Một dòng = một sự việc Tiểu học.", [
    "Mã sự việc",
    "Ngày",
    "Lớp",
    "Chọn lỗi (nội dung)",
    "Mảng",
    "Nội dung lỗi",
    "Nhóm lỗi",
    "Mức trừ",
    "Đơn vị",
    "Số lần vi phạm\n(chỉ dùng lỗi /lần)",
    "Số HS liên quan\n(tự động)",
    "Điểm trừ\n(tự động)",
    "Phạm vi\n(Cá nhân/Tập thể)",
    "Người ghi",
    "Minh chứng bằng hình ảnh (nếu có)",
    "Trạng thái",
    "Nội dung chi tiết",
    "Khối",
    "GVCN",
    "Phó CN",
    "Tuần bắt đầu",
    "Tháng tuần",
    "Học kỳ",
    "Kiểm tra dữ liệu",
  ]);
  const incRow = (r: number, code: string, date: string, cls: string, errorCode: string, n: number | null, related: number, points: number, check: string): Row => {
    const c = cat.get(errorCode) as CatalogSpec;
    return [f(codeFormula(r), code), d(date), cls, choiceOf(c), c.category, c.issue, c.group, c.penalty, c.unit, n, related, points, null, null, null, null, null, Number(cls[0]), null, null, null, null, null, check];
  };
  putRows(inc, [
    incRow(5, "NN-20261002-0001", "2026-10-02", "5A6", "L01", null, 1, 2, "OK"),
    incRow(6, "NN-20261005-0002", "2026-10-05", "1A1", "L04", null, 2, 4, "OK"),
    incRow(7, "NN-20261006-0003", "2026-10-06", "1A2", "L03", 2, 0, 10, "OK"),
    incRow(8, "NN-20261007-0004", "2026-10-07", "1A1", "L01", null, 0, 0, "THIẾU HS LIÊN QUAN"),
  ]);

  const links = sheet(wb, "HS liên quan", "HỌC SINH LIÊN QUAN – TIỂU HỌC", "Chọn Mã sự việc trước → chọn học sinh đúng lớp.", [
    "Mã sự việc",
    "Chọn học sinh (theo tên)",
    "Họ và tên",
    "Ngày sinh",
    "Lớp HS",
    "Lớp sự việc",
    "Kiểm tra",
    "Tuần bắt đầu",
    "Mã lỗi",
    "Mã HS (tự động)",
  ]);
  // Dropdown helper column far to the right (class code as header, choices below) – must be ignored.
  links.getCell("AZ4").value = "1A1";
  links.getCell("AZ5").value = "Học Sinh Mẫu An | 1A1 | 05/09/2019 | 99010001";
  links.getCell("AZ6").value = "Học Sinh Mẫu Bình | 1A1 | 12/12/2019 | 99010002";
  const { linked } = LEGACY_PEOPLE.th;
  putRows(links, [
    // cached lookups
    ["NN-20261002-0001", `${linked.name} | 5A6 | 18/09/2015 | ${linked.id}`, f("INDEX(1)", linked.name), f("INDEX(2)", d(linked.dob)), f("INDEX(3)", "5A6"), f("VLOOKUP(1)", "5A6"), "OK", null, "L01", f("RIGHT(B5,8)", linked.id)],
    // lookups never calculated: everything comes from the combined choice
    ["NN-20261005-0002", "Học Sinh Mẫu An | 1A1 | 05/09/2019 | 99010001", f("INDEX(1)"), f("INDEX(2)"), f("INDEX(3)"), f("VLOOKUP(1)"), null, null, null, f("RIGHT(B6,8)")],
    ["NN-20261005-0002", "Học Sinh Mẫu Bình | 1A1 | 12/12/2019 | 99010002", f("INDEX(1)"), f("INDEX(2)"), f("INDEX(3)"), f("VLOOKUP(1)"), null, null, null, f("RIGHT(B7,8)")],
  ]);

  const cls = sheet(wb, "Danh mục", "DANH MỤC LỚP TIỂU HỌC", "GVCN, PCN, SĐT và Mail đồng bộ từ danh sách lớp.", ["Lớp", "Khối", "Hệ", "GVCN", "Phó CN", "SĐT GVCN", "Mail GVCN"]);
  const hr = LEGACY_PEOPLE.th.homeroom;
  putRows(cls, [
    // phone typed as a number: Excel drops the leading 0
    ["1A1", 1, null, hr.teacher, "Thầy Phó Mẫu Một", Number(hr.phone), hr.email],
    ["1A2", 1, null, "Cô Giáo Mẫu Ba", null, "0900000002", "gvcn.1a2@example.test"],
    ["5A6", 5, null, "Thầy Giáo Mẫu Bốn", null, null, null],
  ]);

  // A report sheet with roster-like columns placed BEFORE "DS Học sinh": the roster parser must prefer "DS Học sinh".
  const report = sheet(wb, "BC Học sinh", "BÁO CÁO HỌC SINH", undefined, ["Mã HS", "Họ và tên", "Lớp", "Số lượt"]);
  putRows(report, [["99000000", "Không phải danh sách", "1A1", 3]]);

  const stu = sheet(wb, "DS Học sinh", "DANH SÁCH HỌC SINH TIỂU HỌC", "Danh sách học sinh Khối 1–5.", [
    "Mã HS",
    "Họ và tên",
    "Ngày sinh",
    "Lớp",
    "Khối",
    "Chọn học sinh (Tên | Lớp | Ngày sinh | Mã HS)",
  ]);
  const first = LEGACY_PEOPLE.th.firstStudent;
  putRows(stu, [
    // ids typed as numbers in the TH file
    [Number(first.id), first.name, d(first.dob), first.classCode, "1", `${first.name} | 1A1 | 05/09/2019 | ${first.id}`],
    [99010002, "Học Sinh Mẫu Bình", d("2019-12-12"), "1A1", "1", "Học Sinh Mẫu Bình | 1A1 | 12/12/2019 | 99010002"],
    [99010003, "Học Sinh Mẫu Cường", d("2019-03-03"), "1A2", "1", "Học Sinh Mẫu Cường | 1A2 | 03/03/2019 | 99010003"],
    [Number(linked.id), linked.name, d(linked.dob), linked.classCode, "5", `${linked.name} | 5A6 | 18/09/2015 | ${linked.id}`],
  ]);
}

/* --------------------------------- THCS ----------------------------------- */

function buildTHCS(wb: ExcelJS.Workbook): void {
  const cat = new Map(catalogOf("THCS").map((c) => [c.code, c]));
  const inc = sheet(wb, "Nhập liệu", "NHẬP LIỆU SỰ VIỆC NỀN NẾP – THCS", "Một dòng = một sự việc.", [
    "Mã sự việc",
    "Ngày",
    "Lớp",
    "Chọn lỗi (nội dung)",
    "Mảng",
    "Nội dung lỗi",
    "Nhóm lỗi",
    "Mức trừ",
    "Đơn vị",
    "Số lần vi phạm",
    "Số HS liên quan",
    "Điểm trừ",
    "Phạm vi",
    "Người ghi",
    "Minh chứng",
    "Trạng thái",
    "Nội dung chi tiết",
    "Khối",
    "GVCN",
    "Phó CN",
    "Tuần bắt đầu",
    "Tháng tuần",
    "Học kỳ",
    "Kiểm tra dữ liệu",
  ]);
  const { reporter } = LEGACY_PEOPLE.thcs;
  const pointsFormula = (r: number) => `IF(I${r}="","",IF(I${r}="/HS",H${r}*K${r},H${r}*IF(J${r}="",1,J${r})))`;
  const incRow = (
    r: number,
    code: string | undefined,
    date: string,
    cls: string,
    errorCode: string,
    o: { n?: number; related?: number; points: number | ExcelJS.CellFormulaValue; scope?: string; status?: string; check: string | ExcelJS.CellFormulaValue },
  ): Row => {
    const c = cat.get(errorCode) as CatalogSpec;
    return [
      f(codeFormula(r), code),
      d(date),
      cls,
      choiceOf(c),
      f(`VLOOKUP(RIGHT(D${r},3),'Bảng điểm lỗi'!$A$5:$G$47,2,FALSE)`, c.category),
      f(`VLOOKUP(RIGHT(D${r},3),'Bảng điểm lỗi'!$A$5:$G$47,3,FALSE)`, c.issue),
      c.group,
      c.penalty,
      c.unit,
      o.n ?? null,
      o.related ?? 0,
      o.points,
      o.scope ?? null,
      reporter,
      null,
      o.status ?? "Mới ghi nhận",
      null,
      Number(/^\d+/.exec(cls)?.[0]),
      null,
      null,
      null,
      null,
      null,
      o.check,
    ];
  };
  putRows(inc, [
    incRow(5, "NN-20260923-0001", "2026-09-23", "9I0", "L43", { n: 1, related: 1, points: f(pointsFormula(5), 2), scope: "Cá nhân", check: "OK" }),
    // hand-typed points instead of the formula
    incRow(6, "NN-20260924-0002", "2026-09-24", "6A0H", "L01", { related: 0, points: 1, scope: "Tập thể", check: "THIẾU HS LIÊN QUAN" }),
    // non-standard texts typed into "Kiểm tra dữ liệu" are kept as legacy notes (names of unlisted students, remarks…)
    incRow(7, "NN-20260925-0003", "2026-09-25", "6A01", "L02", { related: 0, points: f(pointsFormula(7), 0), scope: "Tập thể", check: "Không đeo khăn quàng" }),
    incRow(8, "NN-20260925-0004", "2026-09-25", "6A0H", "L04", { related: 0, points: f(pointsFormula(8), 0), scope: "Tập thể", check: "Học Sinh Mẫu Dũng (tiết 2)" }),
    // standard label written in lower case is not a legacy note
    incRow(9, "NN-20260928-0005", "2026-09-28", "6A01", "L10", { n: 2, points: f(pointsFormula(9), 10), scope: "Tập thể", status: "Đã đóng", check: f("IF(1,\"ok\")", "ok") }),
    // the Mã sự việc formula was never calculated → rebuilt from the date and the row number
    incRow(10, undefined, "2026-10-01", "9I0", "L01", { related: 0, points: f(pointsFormula(10)), scope: "Cá nhân", check: f("IF(1,\"\")") }),
    incRow(11, "NN-20261002-0007", "2026-10-02", "6a0h", "L01", { related: 1, points: f(pointsFormula(11), 2), scope: "Cá nhân", check: "OK" }),
  ]);

  const links = sheet(wb, "HS liên quan", "HỌC SINH LIÊN QUAN ĐẾN SỰ VIỆC", "Nhiều HS: thêm nhiều dòng cùng Mã sự việc.", [
    "Mã sự việc",
    "Lớp sự việc",
    "Chọn học sinh",
    "Mã HS",
    "Ghi chú",
    "Kiểm tra trùng",
    "Trạng thái dữ liệu",
  ]);
  const { linked, firstStudent } = LEGACY_PEOPLE.thcs;
  putRows(links, [
    ["NN-20260923-0001", f("VLOOKUP(A5)", "9I0"), linked.name, f("LOOKUP(2)", linked.id), "Đi chân đất ngoài hành lang", f("IF(1)", "OK"), f("IF(2)", "OK")],
    ["NN-20261002-0007", f("VLOOKUP(A6)", "6A0H"), firstStudent.name, f("LOOKUP(2)", firstStudent.id), null, f("IF(1)", "OK"), f("IF(2)", "OK")],
    // student chosen but the incident code was left empty → ignored with a warning
    [null, null, "Học Sinh Mẫu Hà", null, null, null, null],
    // incident code not present in "Nhập liệu"
    ["NN-20261231-0099", null, "Học Sinh Mẫu Hà", "99060101", null, null, null],
  ]);

  const cls = sheet(wb, "Danh mục", "DANH MỤC LỚP THCS", "GVCN và Phó CN dùng cho lookup.", ["Lớp", "Khối", "Hệ", "GVCN", "Phó CN", "Sĩ số nguồn", "Sĩ số Dashboard", "Đối soát"]);
  const hr = LEGACY_PEOPLE.thcs.homeroom6A0H;
  const longText =
    "Cô Giáo Mẫu Năm (Toán) – phụ trách chung; Thầy Giáo Mẫu Sáu (Ngữ văn) – phụ trách nền nếp buổi sáng; " +
    "Cô Giáo Mẫu Bảy (Tiếng Anh) – phụ trách bán trú và các hoạt động ngoài giờ lên lớp của khối 9.";
  putRows(cls, [
    ["6A0H", 6, "Hội nhập", hr.teacher, null, hr.sourceSize, 29, "Khớp"],
    ["6A01", 6, null, "Cô Giáo Mẫu Tám", "Thầy Phó Mẫu Hai", 30, 30, "Khớp"],
    ["9I0", 9, "Quốc tế", longText, null, 25, 25, "Khớp"],
  ]);

  const stu = sheet(wb, "DS Học sinh", "DANH SÁCH HỌC SINH THCS", "Dán/cập nhật danh sách học sinh tại đây.", ["Lớp", "Họ và tên học sinh", "Mã HS", "Trạng thái"]);
  putRows(stu, [
    [firstStudent.classCode, firstStudent.name, firstStudent.id, firstStudent.statusText],
    ["6A01", "Học Sinh Mẫu Hà", "99060101", "Chuyển lớp nội bộ"],
    ["9I0", linked.name, linked.id, "Chuyển đến HKI"],
    ["9I0", "Học Sinh Mẫu Hiếu", "99090002", "Đang học"],
  ]);
}

/* --------------------------------- THPT ----------------------------------- */

function buildTHPT(wb: ExcelJS.Workbook): void {
  const cat = new Map(catalogOf("THPT").map((c) => [c.code, c]));
  const inc = sheet(wb, "Nhập liệu", "NHẬP LIỆU SỰ VIỆC NỀN NẾP – THPT", "Một dòng = một sự việc.", [
    "Mã sự việc",
    "Ngày",
    "Lớp",
    "Chọn lỗi (nội dung)",
    "Mảng",
    "Nội dung lỗi",
    "Nhóm lỗi",
    "Mức trừ",
    "Đơn vị",
    "Số lần vi phạm\n(chỉ dùng lỗi /lần)",
    "Số HS liên quan\n(tự động)",
    "Điểm trừ\n(tự động)",
    "Phạm vi\n(Cá nhân/Tập thể)",
    "Người ghi",
    "Minh chứng bằng hình ảnh (nếu có)",
    "Trạng thái",
    "Nội dung chi tiết",
    "Khối",
    "GVCN",
    "Phó CN",
    "Tuần bắt đầu",
    "Tháng tuần",
    "Học kỳ",
    "Kiểm tra dữ liệu",
  ]);
  const incRow = (r: number, code: string, date: string, cls: string, errorCode: string, scope: string | null, status: string | null, evidence: ExcelJS.CellValue = null): Row => {
    const c = cat.get(errorCode) as CatalogSpec;
    return [f(codeFormula(r), code), d(date), cls, choiceOf(c), c.category, c.issue, c.group, c.penalty, c.unit, null, 1, c.penalty, scope, "Cô Giám Thị Mẫu", evidence, status, null, Number(/^\d+/.exec(cls)?.[0]), null, null, null, null, null, "OK"];
  };
  putRows(inc, [
    incRow(5, "NN-20261005-0001", "2026-10-05", "12L01", "L01", "   ", "Đang xử lý", { text: "ảnh", hyperlink: "https://example.test/anh/1.jpg" }),
    incRow(6, "NN-20261006-0002", "2026-10-06", "10T0", "L02", null, "Đã giao"),
    incRow(7, "NN-20261007-0003", "2026-10-07", "12L01", "L04", "cá nhân", "Đã đóng"),
    incRow(8, "NN-20261008-0004", "2026-10-08", "10T0", "L43", "Tập thể", null),
  ]);

  const links = sheet(wb, "HS liên quan", "HỌC SINH LIÊN QUAN", "Chọn Mã sự việc trước → dropdown chỉ hiện học sinh của lớp đó.", [
    "Mã sự việc",
    "Chọn học sinh (theo tên)",
    "Họ và tên",
    "Ngày sinh",
    "Lớp HS",
    "Lớp sự việc",
    "Kiểm tra",
    "Tuần bắt đầu",
    "Mã lỗi",
    "Mã HS (tự động)",
  ]);
  const { linked } = LEGACY_PEOPLE.thpt;
  putRows(links, [
    ["NN-20261005-0001", `${linked.name} | 12L01 | 02/02/2009 | ${linked.id}`, f("VLOOKUP(J5,2)", linked.name), f("VLOOKUP(J5,3)", d("2009-02-02")), f("VLOOKUP(J5,4)", "12L01"), f("VLOOKUP(A5)", "12L01"), f("IF(1)", "OK"), null, null, f("RIGHT(B5,8)", linked.id)],
    ["NN-20261007-0003", "HỌC SINH MẪU LONG | 12L01 | 03/03/2009 | 99120002", f("VLOOKUP(J6,2)"), f("VLOOKUP(J6,3)"), f("VLOOKUP(J6,4)"), f("VLOOKUP(A6)"), null, null, null, f("RIGHT(B6,8)")],
  ]);

  const cls = sheet(wb, "Danh mục", "DANH MỤC LỚP THPT", undefined, ["Lớp", "Khối", "Hệ", "GVCN", "Phó CN"]);
  putRows(cls, [
    ["10T0", 10, "Chuyên", "Thầy Giáo Mẫu Chín", null],
    ["12L01", 12, null, "Cô Giáo Mẫu Mười", "Thầy Phó Mẫu Ba"],
  ]);

  const stu = sheet(wb, "DS Học sinh", "DANH SÁCH HỌC SINH THPT", undefined, ["Mã HS", "Họ và tên", "Ngày sinh", "Lớp", "Khối", "Chọn học sinh (Tên | Lớp | Ngày sinh | Mã HS)"]);
  putRows(stu, [
    [linked.id, linked.name, d("2009-02-02"), "12L01", 12, `${linked.name} | 12L01 | 02/02/2009 | ${linked.id}`],
    ["99120002", "HỌC SINH MẪU LONG", d("2009-03-03"), "12L01", 12, "HỌC SINH MẪU LONG | 12L01 | 03/03/2009 | 99120002"],
    ["99100001", "Học Sinh Mẫu Minh", d("2011-04-04"), "10T0", 10, "Học Sinh Mẫu Minh | 10T0 | 04/04/2011 | 99100001"],
  ]);
}

/* ---------------------------------- API ------------------------------------ */

/** A legacy-layout workbook of the level, filled with synthetic data (see LEGACY_EXPECTED / LEGACY_PEOPLE). */
export async function buildLegacyWorkbook(level: LevelId): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  if (level === "TH") buildTH(wb);
  else if (level === "THCS") buildTHCS(wb);
  else buildTHPT(wb);
  addCatalog(wb, level);
  addConfig(wb, level);
  addWeeks(wb, level);
  wb.addWorksheet("Hướng dẫn").getCell("A1").value = "HƯỚNG DẪN SỬ DỤNG";
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
