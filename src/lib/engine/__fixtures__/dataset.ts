/**
 * Realistic THCS-like dataset for tests and UI demos (fictional names). Deterministic; returns fresh objects per call.
 *
 * Story (today = FIXTURE_TODAY = 2026-10-21, Wednesday of week 2026-10-19):
 * - Grades 6 (6A01–6A05) and 7 (7A01–7A03 active, 7A04 inactive); 60 students incl. one TRANSFERRED_OUT (Vũ Hoàng Long, 6A02).
 * - Calendar: generateWeeks(defaultLevelConfig("THCS")); week 2026-08-31 is a non-counted holiday week; rag.approved = true.
 * - ~80 incidents in weeks 2026-09-07 … 2026-10-19 (real NSHM catalog items, points via buildIncidentCore).
 * - 6A03: troubled class (October avg ≥ 25 → RED; ≥ 10 points for 4 consecutive weeks); Phạm Thiện Khôi has 3 incidents in
 *   week 2026-10-12 (WEEKLY_RED). 7A02: October avg ≈ 11 → YELLOW, 3 consecutive weeks. 7A03: 2 REVIEW records in
 *   October → low data confidence → GRAY. Đỗ Văn Đạt (7A01): 2 incidents 2 weeks apart → REPEAT.
 *   Phạm Gia Huy (6A01) is named only in a "/lần" incident → 0 personal points. THIEU_TEN_HS in 6A04, 6A03, 7A01.
 * - Rewards in all 3 statuses (only "Đã xác nhận" counts by default).
 */
import { defaultLevelConfig } from "../../constants";
import type {
  CatalogItem,
  ClassInfo,
  DataIssue,
  Incident,
  IncidentStatus,
  LevelDataset,
  Reward,
  RewardStatus,
  SchoolWeek,
  Scope,
  StudentLite,
  StudentRef,
} from "../../types";
import { compactDate, generateWeeks, weekInfo } from "../dates";
import { buildIncidentCore } from "../scoring";

export const FIXTURE_TODAY = "2026-10-21";
export const FIXTURE_HOLIDAY_WEEK = "2026-08-31";

/** Ids of the students that drive the fixture story. */
export const FIXTURE_STUDENT_IDS = {
  /** Phạm Thiện Khôi, 6A03 – 3 incidents in week 2026-10-12 → WEEKLY_RED */
  khoi: "26060301",
  /** Đỗ Văn Đạt, 7A01 – incidents on 2026-09-29 and 2026-10-13 → REPEAT */
  dat: "26070101",
  /** Phạm Gia Huy, 6A01 – only named in a "/lần" incident (L10) → 0 personal points */
  huy: "26060104",
  /** Vũ Hoàng Long, 6A02 – TRANSFERRED_OUT on 2026-10-01, has 2 September incidents */
  long: "26060208",
  /** Nguyễn Trường Phúc, 6A01 */
  truongPhuc6A01: "26060101",
  /** Đinh Trường Phúc, 7A02 */
  truongPhuc7A02: "26070201",
  /** Nguyễn Phúc Trường, 7A01 */
  phucTruong7A01: "26070102",
} as const;

const CAT_CC = "Chuyên cần – vệ sinh";
const CAT_HT = "Học tập – truy bài";
const CAT_BT = "Bán trú – xe buýt";
const CAT_KHAC = "Các lỗi vi phạm khác";

const CATALOG: CatalogItem[] = [
  { code: "L01", category: CAT_CC, issue: "Đi học muộn", group: "Nhóm 1", penalty: 2, unit: "/HS", is5S: false, active: true },
  { code: "L02", category: CAT_CC, issue: "Đồng phục không đúng quy định", group: "Nhóm 1", penalty: 2, unit: "/HS", is5S: false, active: true },
  { code: "L03", category: CAT_CC, issue: "Vi phạm quy định vệ sinh 5S trong khuôn viên trường, lớp học", group: "Nhóm 1", penalty: 2, unit: "/HS", is5S: true, active: true },
  { code: "L04", category: CAT_CC, issue: "Giày dép để lộn xộn", group: "Nhóm 1", penalty: 2, unit: "/HS", is5S: true, active: true },
  { code: "L05", category: CAT_HT, issue: "Làm mất trật tự trong giờ: nói chuyện riêng, đọc truyện…", group: "Nhóm 1", penalty: 2, unit: "/HS", is5S: false, active: true },
  { code: "L10", category: CAT_HT, issue: "Không nộp sổ Nhật ký học tập", group: "Nhóm 3", penalty: 5, unit: "/lần", is5S: false, active: true },
  { code: "L11", category: CAT_BT, issue: "Không vệ sinh bàn ăn sau giờ ăn", group: "Nhóm 1", penalty: 5, unit: "/lần", is5S: true, active: true },
  { code: "L14", category: CAT_BT, issue: "Vệ sinh bẩn: chưa kê lại bàn ghế, bàn ăn bẩn…", group: "Nhóm 1", penalty: 2, unit: "/lần", is5S: true, active: true },
  { code: "L28", category: CAT_KHAC, issue: "Đầu tóc không gọn gàng; nhuộm tóc", group: "Nhóm 2", penalty: 10, unit: "/HS", is5S: false, active: true },
  { code: "L35", category: CAT_KHAC, issue: "Bạo lực học đường dưới mọi hình thức", group: "Nhóm 3", penalty: 10, unit: "/HS", is5S: false, active: true },
];

const CLASS_ROWS: Array<[code: string, grade: number, teacher: string, active: boolean]> = [
  ["6A01", 6, "Nguyễn Thu Hà", true],
  ["6A02", 6, "Trần Thị Mai", true],
  ["6A03", 6, "Lê Văn Hùng", true],
  ["6A04", 6, "Phạm Thị Hồng", true],
  ["6A05", 6, "Vũ Minh Tâm", true],
  ["7A01", 7, "Đặng Thị Lan", true],
  ["7A02", 7, "Bùi Văn Long", true],
  ["7A03", 7, "Hoàng Thị Nga", true],
  ["7A04", 7, "Ngô Thị Hoa", false],
];

const ROSTER: Record<string, string[]> = {
  "6A01": ["Nguyễn Trường Phúc", "Trần Bảo Anh", "Lê Minh Châu", "Phạm Gia Huy", "Hoàng Khánh Linh", "Vũ Đức Minh", "Đặng Ngọc Hân"],
  "6A02": ["Bùi Quang Hải", "Đỗ Thùy Dương", "Ngô Tuấn Kiệt", "Lý Hải Yến", "Trịnh Văn Nam", "Phan Mai Anh", "Hồ Thanh Tùng"],
  "6A03": ["Phạm Thiện Khôi", "Nguyễn Hoàng Nam", "Trần Thị Ngọc Ánh", "Lê Quốc Bảo", "Võ Thành Đạt", "Hà Phương Thảo", "Đinh Công Sơn", "Lã Tiến Thành"],
  "6A04": ["Mai Anh Tuấn", "Lương Thu Trang", "Tạ Minh Quân", "Chu Bảo Ngọc", "Đoàn Nhật Minh", "Kiều Thanh Mai", "Hồ Hạnh Phúc"],
  "6A05": ["Nguyễn Đức Anh", "Phí Thùy Linh", "Lâm Gia Bảo", "Tô Minh Thư", "Đàm Quang Vinh", "Cao Hà Vy", "Âu Khánh Duy", "Mạc Thị Lan"],
  "7A01": ["Đỗ Văn Đạt", "Nguyễn Phúc Trường", "Trần Hải Đăng", "Lê Thảo Nguyên", "Phạm Anh Thư", "Vương Tiến Dũng", "Hoàng Yến Nhi", "Cù Minh Khang"],
  "7A02": ["Đinh Trường Phúc", "Bạch Ngọc Hà", "Nghiêm Xuân Trường", "Quách Minh Anh", "Lục Gia Hưng", "Doãn Thu Hằng", "Triệu Đức Thắng"],
  "7A03": ["Nguyễn Khánh Toàn", "Lê Hà My", "Trần Đình Phong", "Phùng Bảo Trâm", "Ninh Văn Quyết", "Giang Mỹ Linh", "Thái Đức Huy"],
};

const pad = (n: number, len = 2) => String(n).padStart(len, "0");
const studentId = (classCode: string, idx: number) => `26${pad(Number(classCode[0]))}${classCode.slice(2)}${pad(idx + 1)}`;

/**
 * Compact incident spec. `s` = indexes in the class roster; `ids` = explicit student ids (e.g. transferred student);
 * `u` = unnamed count; `n` = occurrence count ("/lần"); `review` = extra import issue making the record REVIEW.
 */
interface Spec {
  d: string;
  c: string;
  e: string;
  s?: number[];
  ids?: string[];
  u?: number;
  n?: number;
  scope?: Scope;
  review?: DataIssue;
  detail?: string;
  gvcnNote?: string;
}

const MISMATCH: DataIssue = { code: "POINTS_MISMATCH_IMPORT", message: "Điểm trong file (4) khác điểm tính theo quy tắc (2)." };

const SPECS: Spec[] = [
  // Week 2026-09-07
  { d: "2026-09-07", c: "6A01", e: "L01", s: [0] },
  { d: "2026-09-07", c: "6A03", e: "L01", s: [1] },
  { d: "2026-09-08", c: "6A03", e: "L05", s: [3] },
  { d: "2026-09-08", c: "6A02", e: "L02", s: [2] },
  { d: "2026-09-09", c: "7A01", e: "L01", s: [2, 3] },
  { d: "2026-09-09", c: "7A03", e: "L02", s: [4] },
  { d: "2026-09-10", c: "6A05", e: "L14", n: 1, detail: "Bàn ăn tầng 2 chưa được lau sau giờ ăn trưa." },
  { d: "2026-09-11", c: "7A02", e: "L05", s: [4] },
  { d: "2026-09-11", c: "6A04", e: "L04", s: [2] },
  // Week 2026-09-14
  { d: "2026-09-14", c: "6A03", e: "L02", s: [4] },
  { d: "2026-09-14", c: "6A02", e: "L01", ids: [FIXTURE_STUDENT_IDS.long] },
  { d: "2026-09-15", c: "6A01", e: "L05", s: [1, 2] },
  { d: "2026-09-15", c: "7A01", e: "L10", n: 1 },
  { d: "2026-09-16", c: "6A05", e: "L01", s: [0] },
  { d: "2026-09-16", c: "7A02", e: "L02", s: [1] },
  { d: "2026-09-17", c: "6A04", e: "L01", s: [3, 4] },
  { d: "2026-09-17", c: "6A02", e: "L03", s: [5] },
  { d: "2026-09-18", c: "7A03", e: "L01", s: [0] },
  { d: "2026-09-18", c: "6A05", e: "L02", s: [5] },
  // Week 2026-09-21
  { d: "2026-09-21", c: "6A03", e: "L01", s: [0, 1] },
  { d: "2026-09-22", c: "6A03", e: "L14", n: 1 },
  { d: "2026-09-22", c: "6A02", e: "L28", ids: [FIXTURE_STUDENT_IDS.long], detail: "Nhuộm tóc màu nâu đỏ." },
  { d: "2026-09-22", c: "6A02", e: "L05", s: [0], review: MISMATCH },
  { d: "2026-09-23", c: "6A01", e: "L02", s: [1] },
  { d: "2026-09-23", c: "7A01", e: "L05", s: [5, 6] },
  { d: "2026-09-24", c: "6A05", e: "L03", s: [2, 3] },
  { d: "2026-09-24", c: "7A02", e: "L01", s: [0] },
  { d: "2026-09-25", c: "6A04", e: "L10", n: 1 },
  { d: "2026-09-25", c: "7A03", e: "L04", s: [3] },
  { d: "2026-09-25", c: "6A01", e: "L03", s: [2] },
  // Week 2026-09-28
  { d: "2026-09-28", c: "6A03", e: "L05", s: [0, 3, 6] },
  { d: "2026-09-29", c: "6A03", e: "L03", s: [2, 5] },
  { d: "2026-09-29", c: "7A01", e: "L02", s: [0] },
  { d: "2026-09-30", c: "6A01", e: "L04", s: [4] },
  { d: "2026-09-30", c: "7A02", e: "L04", s: [3] },
  { d: "2026-10-01", c: "6A05", e: "L05", s: [4, 5] },
  { d: "2026-10-01", c: "6A02", e: "L01", s: [3] },
  { d: "2026-10-02", c: "6A04", e: "L02", s: [5] },
  { d: "2026-10-02", c: "7A03", e: "L03", s: [5, 6] },
  { d: "2026-10-02", c: "7A01", e: "L14", n: 1 },
  // Week 2026-10-05
  { d: "2026-10-05", c: "6A03", e: "L28", s: [3, 4], detail: "Hai em để tóc dài, không gọn gàng; đã nhắc lần 2." },
  { d: "2026-10-06", c: "6A03", e: "L01", s: [1, 4] },
  { d: "2026-10-07", c: "6A03", e: "L10", n: 1 },
  { d: "2026-10-05", c: "7A02", e: "L01", s: [1, 2, 3] },
  { d: "2026-10-06", c: "7A02", e: "L05", s: [4, 5] },
  { d: "2026-10-06", c: "6A04", e: "L01", s: [0, 1], u: 3, scope: "Tập thể", detail: "5 học sinh vào lớp muộn, chỉ ghi được tên 2 em." },
  { d: "2026-10-07", c: "6A01", e: "L10", s: [3], n: 1 },
  { d: "2026-10-07", c: "7A03", e: "L01", s: [0], review: MISMATCH },
  { d: "2026-10-08", c: "7A03", e: "L02", s: [1] },
  { d: "2026-10-08", c: "6A05", e: "L04", s: [6] },
  { d: "2026-10-08", c: "7A01", e: "L03", s: [4] },
  { d: "2026-10-09", c: "6A02", e: "L02", s: [4] },
  { d: "2026-10-09", c: "6A01", e: "L02", s: [6] },
  // Week 2026-10-12
  { d: "2026-10-12", c: "6A03", e: "L01", s: [0] },
  { d: "2026-10-13", c: "6A03", e: "L04", s: [5] },
  { d: "2026-10-14", c: "6A03", e: "L05", s: [0, 6] },
  {
    d: "2026-10-15",
    c: "6A03",
    e: "L35",
    s: [0, 3],
    detail: "Xô xát trong giờ ra chơi tại sân trường.",
    gvcnNote: "Đã mời phụ huynh hai em lên trao đổi ngày 16/10.",
  },
  { d: "2026-10-16", c: "6A03", e: "L14", n: 2 },
  { d: "2026-10-12", c: "7A02", e: "L02", s: [6] },
  { d: "2026-10-13", c: "7A02", e: "L10", n: 2 },
  { d: "2026-10-13", c: "7A01", e: "L28", s: [0] },
  { d: "2026-10-13", c: "6A01", e: "L04", s: [5] },
  { d: "2026-10-14", c: "7A03", e: "L05", scope: "Tập thể", review: { code: "LEGACY_NOTE", message: "Nhập từ file cũ: chưa liên kết học sinh." } },
  { d: "2026-10-14", c: "6A04", e: "L03", s: [6] },
  { d: "2026-10-15", c: "6A05", e: "L01", s: [7] },
  { d: "2026-10-15", c: "6A02", e: "L05", s: [1, 6] },
  { d: "2026-10-16", c: "6A04", e: "L14", n: 1 },
  { d: "2026-10-16", c: "7A01", e: "L05", s: [2] },
  // Week 2026-10-19 (current week, today = Wednesday 2026-10-21)
  { d: "2026-10-19", c: "6A03", e: "L01", s: [1, 7] },
  { d: "2026-10-19", c: "6A03", e: "L02", s: [2] },
  { d: "2026-10-20", c: "6A03", e: "L05", s: [4], u: 2, scope: "Tập thể" },
  { d: "2026-10-20", c: "6A03", e: "L03", s: [5, 6] },
  { d: "2026-10-19", c: "7A02", e: "L01", s: [0] },
  { d: "2026-10-20", c: "7A02", e: "L28", s: [2] },
  { d: "2026-10-19", c: "7A03", e: "L03", s: [2] },
  { d: "2026-10-20", c: "6A01", e: "L01", s: [6] },
  { d: "2026-10-20", c: "6A05", e: "L02", s: [1] },
  { d: "2026-10-21", c: "7A01", e: "L01", s: [7], u: 1, scope: "Tập thể" },
  { d: "2026-10-21", c: "6A02", e: "L04", s: [0] },
  { d: "2026-10-21", c: "6A04", e: "L05", s: [2] },
];

const REWARD_ROWS: Array<[date: string, classCode: string, points: number, reason: string, status: RewardStatus]> = [
  ["2026-09-18", "6A01", 10, "Đạt giải Nhất hội diễn văn nghệ chào năm học mới", "Đã xác nhận"],
  ["2026-09-25", "7A02", 10, "Đạt giải Nhì cuộc thi trang trí lớp học thân thiện", "Đã xác nhận"],
  ["2026-10-06", "6A04", 5, "Tích cực tham gia phong trào Kế hoạch nhỏ", "Đã xác nhận"],
  ["2026-10-08", "7A03", 5, "Tham gia tích cực Ngày hội đọc sách", "Đang xác minh"],
  ["2026-10-09", "6A05", 5, "Học sinh nhặt được của rơi trả lại người đánh mất", "Đang xác minh"],
  ["2026-10-14", "7A01", 8, "Đạt giải Ba bóng đá nam khối 7", "Mới ghi nhận"],
  ["2026-10-16", "6A01", 5, "Lớp có tiến bộ rõ rệt về nền nếp trong tháng 10", "Đã xác nhận"],
  ["2026-10-20", "6A03", 3, "Hoàn thành tốt buổi lao động vệ sinh khuôn viên", "Mới ghi nhận"],
];

const EDITOR = { uid: "uid-editor-thcs", name: "Nguyễn Văn Quang" };

function buildClasses(): ClassInfo[] {
  return CLASS_ROWS.map(([code, grade, teacher, active], order) => ({
    code,
    levelId: "THCS",
    grade,
    homeroomTeacher: teacher,
    sourceSize: 30 + ((order * 3) % 6),
    active,
    order,
  }));
}

function buildStudents(classes: ClassInfo[]): StudentLite[] {
  const out: StudentLite[] = [];
  for (const c of classes) {
    (ROSTER[c.code] ?? []).forEach((name, idx) => {
      const year = 2026 - c.grade - 5;
      out.push({ id: studentId(c.code, idx), name, dob: `${year}-${pad(1 + (idx % 12))}-${pad(1 + ((idx * 7) % 28))}`, classCode: c.code, grade: c.grade, status: "ACTIVE" });
    });
  }
  out.push({ id: FIXTURE_STUDENT_IDS.long, name: "Vũ Hoàng Long", dob: "2015-03-12", classCode: "6A02", grade: 6, status: "TRANSFERRED_OUT" });
  return out;
}

function buildWeeks(): SchoolWeek[] {
  const config = defaultLevelConfig("THCS");
  return generateWeeks(config.firstWeek, config.semesters).map((w) =>
    w.weekStart === FIXTURE_HOLIDAY_WEEK ? { ...w, counted: false, note: "Nghỉ lễ Quốc khánh 2/9 – không tính thi đua" } : w,
  );
}

function statusFor(date: string): IncidentStatus {
  if (date < "2026-10-12") return "Đã đóng";
  if (date < "2026-10-19") return "Đang xử lý";
  return "Mới ghi nhận";
}

function buildIncidents(classes: ClassInfo[], students: StudentLite[], weeks: SchoolWeek[], semesters: LevelDataset["config"]["semesters"]): Incident[] {
  const byId = new Map(students.map((s) => [s.id, s] as const));
  const seqByDate = new Map<string, number>();
  return SPECS.map((spec) => {
    const catalogItem = CATALOG.find((c) => c.code === spec.e);
    const classInfo = classes.find((c) => c.code === spec.c);
    if (!catalogItem || !classInfo) throw new Error(`Fixture spec invalid: ${spec.c} ${spec.e}`);
    const ids = spec.ids ?? (spec.s ?? []).map((idx) => studentId(spec.c, idx));
    const refs: StudentRef[] = ids.map((id) => {
      const s = byId.get(id);
      if (!s) throw new Error(`Fixture student ${id} missing`);
      return { id: s.id, name: s.name, classCode: spec.c };
    });
    const scope: Scope = spec.scope ?? (refs.length === 1 && !spec.u ? "Cá nhân" : "Tập thể");
    const core = buildIncidentCore(
      { date: spec.d, scope, occurrenceCount: spec.n, unnamedCount: spec.u, status: statusFor(spec.d), reporter: EDITOR.name, detail: spec.detail },
      { catalogItem, classInfo, students: refs, weeks, semesters, extraIssues: spec.review ? [spec.review] : undefined },
    );
    const seq = (seqByDate.get(spec.d) ?? 0) + 1;
    seqByDate.set(spec.d, seq);
    const code = `NN-${compactDate(spec.d)}-${pad(seq, 4)}`;
    const incident: Incident = {
      ...core,
      id: `THCS_${code}`,
      code,
      levelId: "THCS",
      source: spec.review ? "import" : "app",
      createdBy: EDITOR.uid,
      createdByName: EDITOR.name,
      createdAt: `${spec.d}T01:${pad(10 + seq)}:00.000Z`,
    };
    if (spec.review) {
      incident.externalId = `${code}-legacy`;
      incident.importBatchId = "batch-legacy-thcs";
    }
    if (spec.gvcnNote) {
      incident.gvcnNote = spec.gvcnNote;
      incident.gvcnNoteBy = "gvcn.6a03@example.edu.vn";
      incident.gvcnNoteAt = "2026-10-16T09:00:00.000Z";
    }
    return incident;
  });
}

function buildRewards(classes: ClassInfo[], weeks: SchoolWeek[], semesters: LevelDataset["config"]["semesters"]): Reward[] {
  const seqByDate = new Map<string, number>();
  return REWARD_ROWS.map(([date, classCode, points, reason, status]) => {
    const cls = classes.find((c) => c.code === classCode);
    if (!cls) throw new Error(`Fixture reward class ${classCode} missing`);
    const seq = (seqByDate.get(date) ?? 0) + 1;
    seqByDate.set(date, seq);
    const code = `KT-${compactDate(date)}-${pad(seq, 4)}`;
    return {
      id: `THCS_${code}`,
      code,
      levelId: "THCS",
      date,
      ...weekInfo(date, weeks, semesters),
      classCode,
      grade: cls.grade,
      points,
      reason,
      reporter: EDITOR.name,
      evidenceUrls: [],
      photoIds: [],
      status,
      source: "app",
      createdBy: EDITOR.uid,
      createdByName: EDITOR.name,
      createdAt: `${date}T08:${pad(seq)}:00.000Z`,
    };
  });
}

/** Fresh THCS fixture dataset (see file header for the story). */
export function makeFixtureDataset(): LevelDataset {
  const config = defaultLevelConfig("THCS");
  config.rag = { ...config.rag, approved: true };
  const classes = buildClasses();
  const students = buildStudents(classes);
  const weeks = buildWeeks();
  return {
    levelId: "THCS",
    version: 1,
    generatedAt: "2026-10-21T03:00:00.000Z",
    config,
    classes,
    catalog: CATALOG.map((c) => ({ ...c })),
    weeks,
    students,
    incidents: buildIncidents(classes, students, weeks, config.semesters),
    rewards: buildRewards(classes, weeks, config.semesters),
    redacted: false,
  };
}
