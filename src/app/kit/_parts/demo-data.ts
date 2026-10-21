/** Deterministic demo data for the /kit showcase (seeded PRNG → identical on server and client). */
import type { RagStatus, Unit } from "@/lib/types";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261021);
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

export const TEACHERS = [
  "Nguyễn Thị Lụa",
  "Trần Văn Hùng",
  "Lê Thu Hiền",
  "Phạm Minh Đức",
  "Hoàng Thị Mai",
  "Vũ Quang Huy",
  "Đặng Thùy Linh",
  "Bùi Thanh Tâm",
  "Đỗ Hải Yến",
  "Ngô Đức Anh",
  "Dương Thị Hương",
  "Lý Minh Châu",
];

export const WEEKS = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
export const WEEK_LABELS = WEEKS.map((w) => `${w.slice(8, 10)}/${w.slice(5, 7)}`);

export interface DemoClass {
  code: string;
  grade: number;
  teacher: string;
}

export const CLASSES: DemoClass[] = [6, 7, 8, 9].flatMap((grade) =>
  Array.from({ length: 12 }, (_, i) => ({
    code: `${grade}A${String(i + 1).padStart(2, "0")}`,
    grade,
    teacher: TEACHERS[(i + grade) % TEACHERS.length],
  })),
);

export interface DemoRankingRow {
  classCode: string;
  grade: number;
  teacher: string;
  base: number;
  reward: number;
  penalty: number;
  score: number;
  rank: number;
  inTop90: boolean;
  rag: RagStatus;
  ragReason: string;
  trend: number[];
  incidents: number;
}

function ragOf(avg: number): { rag: RagStatus; reason: string } {
  const r = Math.round(avg * 10) / 10;
  const txt = r.toLocaleString("vi-VN");
  if (avg >= 25) return { rag: "RED", reason: `TB ${txt} điểm trừ/tuần ≥ ngưỡng đỏ 25` };
  if (avg >= 10) return { rag: "YELLOW", reason: `TB ${txt} điểm trừ/tuần ≥ ngưỡng vàng 10` };
  return { rag: "GREEN", reason: `TB ${txt} điểm trừ/tuần, dưới ngưỡng vàng 10` };
}

function buildRanking(grade: number): DemoRankingRow[] {
  const classes = CLASSES.filter((c) => c.grade === grade);
  const counted = WEEKS.length;
  const rows = classes.map((c, i) => {
    const penalty = i === 4 ? 248 : i === 9 ? 131 : int(18, 120);
    const reward = int(0, 6) * 5;
    const base = 100 * counted;
    const score = base + reward - penalty;
    // Weekly competition score (100 base + reward − penalty of that week).
    const trend = WEEKS.map(() => Math.max(40, 100 + Math.round((reward - penalty) / counted) + int(-9, 9)));
    const { rag, reason } = i === 7 ? { rag: "GRAY" as RagStatus, reason: "Độ tin cậy dữ liệu 72% < 80% – cần rà soát" } : ragOf(penalty / counted);
    return { classCode: c.code, grade, teacher: c.teacher, base, reward, penalty, score, rank: 0, inTop90: false, rag, ragReason: reason, trend, incidents: Math.round(penalty / 2.6) };
  });
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const cutoff = Math.ceil(0.9 * rows.length);
  sorted.forEach((r, i) => {
    r.rank = i > 0 && sorted[i - 1].score === r.score ? sorted[i - 1].rank : i + 1;
    r.inTop90 = r.rank <= cutoff;
  });
  return sorted;
}

export const RANKING: Record<number, DemoRankingRow[]> = { 6: buildRanking(6), 7: buildRanking(7), 8: buildRanking(8), 9: buildRanking(9) };

export const TREND = {
  penalty: [96, 142, 158, 131, 176, 149, 121, 138, 112],
  reward: [10, 25, 15, 40, 30, 35, 55, 45, 60],
  incidents: [41, 60, 66, 55, 72, 63, 50, 58, 47],
};

export const CATEGORY_SHARE = [
  { name: "Chuyên cần – vệ sinh", value: 52 },
  { name: "Tác phong – trang phục", value: 37 },
  { name: "Nề nếp lớp học", value: 29 },
  { name: "Ý thức – thái độ", value: 18 },
  { name: "An toàn – tài sản", value: 11 },
  { name: "5S – Môi trường", value: 7 },
];

export const TOP_ISSUES = [
  { issue: "Đi học muộn", incidents: 38 },
  { issue: "Không đeo thẻ học sinh", incidents: 27 },
  { issue: "Mất trật tự trong giờ học", incidents: 21 },
  { issue: "Vệ sinh lớp chưa sạch", incidents: 18 },
  { issue: "Sử dụng điện thoại sai quy định", incidents: 12 },
];

export const GRADE_COMPARE = {
  grades: ["Khối 6", "Khối 7", "Khối 8", "Khối 9"],
  penalty: [612, 548, 701, 455],
  reward: [95, 120, 70, 135],
};

/** Heatmap: Khối 6 classes × weeks (penalty points). */
export const HEATMAP = (() => {
  const classes = CLASSES.filter((c) => c.grade === 6).map((c) => c.code);
  const values: Array<[number, number, number]> = [];
  classes.forEach((_, y) =>
    WEEKS.forEach((__, x) => {
      const hot = y === 4 ? 14 : y === 9 ? 6 : 0;
      const v = Math.max(0, int(-4, 12) + hot + (x === 4 ? 6 : 0));
      values.push([x, y, v]);
    }),
  );
  return { classes, values };
})();

export interface DemoCatalogItem {
  code: string;
  issue: string;
  category: string;
  penalty: number;
  unit: Unit;
}

export const CATALOG: DemoCatalogItem[] = [
  { code: "L01", issue: "Đi học muộn", category: "Chuyên cần – vệ sinh", penalty: 2, unit: "/HS" },
  { code: "L02", issue: "Nghỉ học không phép", category: "Chuyên cần – vệ sinh", penalty: 5, unit: "/HS" },
  { code: "L03", issue: "Vệ sinh lớp chưa sạch", category: "Chuyên cần – vệ sinh", penalty: 5, unit: "/lần" },
  { code: "L05", issue: "Không đeo thẻ học sinh", category: "Tác phong – trang phục", penalty: 1, unit: "/HS" },
  { code: "L06", issue: "Sai đồng phục", category: "Tác phong – trang phục", penalty: 2, unit: "/HS" },
  { code: "L08", issue: "Mất trật tự trong giờ học", category: "Nề nếp lớp học", penalty: 3, unit: "/lần" },
  { code: "L09", issue: "Sử dụng điện thoại sai quy định", category: "Nề nếp lớp học", penalty: 5, unit: "/HS" },
  { code: "L11", issue: "Xả rác sai nơi quy định", category: "5S – Môi trường", penalty: 2, unit: "/HS" },
  { code: "L12", issue: "Vô lễ với thầy cô", category: "Ý thức – thái độ", penalty: 10, unit: "/HS" },
  { code: "L14", issue: "Làm hỏng tài sản chung", category: "An toàn – tài sản", penalty: 10, unit: "/lần" },
];

const FAMILY = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Ngô"];
const MIDDLE = ["Văn", "Thị", "Minh", "Đức", "Thu", "Gia", "Bảo", "Ngọc", "Quang", "Khánh"];
const GIVEN = ["An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Khôi", "Linh", "Mai", "Nam", "Phúc", "Quân", "Trang", "Tú", "Vy", "Yến", "Huy", "Thảo", "Long", "Nhi"];

export interface DemoStudent {
  id: string;
  name: string;
  classCode: string;
  dob: string;
}

export const STUDENTS: DemoStudent[] = Array.from({ length: 32 }, (_, i) => ({
  id: String(26151400 + i * 7 + 3),
  name: `${FAMILY[i % FAMILY.length]} ${MIDDLE[(i * 3) % MIDDLE.length]} ${GIVEN[(i * 7) % GIVEN.length]}`,
  classCode: "6A03",
  dob: `2014-${String((i % 12) + 1).padStart(2, "0")}-${String(((i * 5) % 27) + 1).padStart(2, "0")}`,
}));
