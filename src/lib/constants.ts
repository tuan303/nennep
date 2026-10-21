import type {
  ActionStatus,
  DataCheck,
  IncidentStatus,
  LevelConfig,
  LevelId,
  LevelMeta,
  Priority,
  RagStatus,
  RewardStatus,
  Role,
  Scope,
  StudentStatus,
  Unit,
  UserProfile,
} from "./types";

export const SCHOOL_NAME = "Trường Ngôi Sao Hoàng Mai";
export const SCHOOL_SHORT = "NSHM";
export const APP_NAME = "NSHM Nền nếp";
export const TIME_ZONE = "Asia/Ho_Chi_Minh";

export const LEVEL_IDS: LevelId[] = ["TH", "THCS", "THPT"];

export const LEVELS: Record<LevelId, LevelMeta> = {
  TH: { id: "TH", name: "Tiểu học", short: "Tiểu học", grades: [1, 2, 3, 4, 5] },
  THCS: { id: "THCS", name: "Trung học cơ sở", short: "THCS", grades: [6, 7, 8, 9] },
  THPT: { id: "THPT", name: "Trung học phổ thông", short: "THPT", grades: [10, 11, 12] },
};

/**
 * Màu nhận diện 3 cấp – đồng bộ với phần mềm "Phiếu đánh giá giờ dạy" của NSHM.
 * brand: chấm/viền/thanh nhấn trên nền sáng · series: chuỗi dữ liệu biểu đồ · ink: chữ nhấn (≥ 4,5:1 trên nền trắng –
 * #FFAD00 chỉ ~1,9:1 nên KHÔNG dùng làm màu chữ) · fill/onFill: nút/ô đang chọn · bar: thanh nhấn trên nền navy ·
 * soft: nền nhạt.
 */
export interface LevelTheme {
  brand: string;
  series: string;
  ink: string;
  fill: string;
  onFill: string;
  bar: string;
  soft: string;
}

export const LEVEL_THEME: Record<LevelId, LevelTheme> = {
  TH: { brand: "#FFAD00", series: "#EC9F07", ink: "#875800", fill: "#FFAD00", onFill: "#1F1500", bar: "#FFAD00", soft: "#FDF0D7" },
  THCS: { brand: "#2DA037", series: "#24922D", ink: "#236F27", fill: "#207E27", onFill: "#FFFFFF", bar: "#2DA037", soft: "#E3F2E4" },
  THPT: { brand: "#23328C", series: "#384DB8", ink: "#23328C", fill: "#23328C", onFill: "#FFFFFF", bar: "#647EE0", soft: "#E8EBF7" },
};

/** Màu "Toàn trường" (đỏ NSHM). */
export const SCHOOL_WIDE_COLOR = "#D21235";

export function levelOfGrade(grade: number): LevelId | undefined {
  return LEVEL_IDS.find((l) => LEVELS[l].grades.includes(grade));
}

export const UNITS: Unit[] = ["/HS", "/lần"];
export const SCOPES: Scope[] = ["Cá nhân", "Tập thể"];
export const INCIDENT_STATUSES: IncidentStatus[] = ["Mới ghi nhận", "Đang xử lý", "Đã đóng"];
export const REWARD_STATUSES: RewardStatus[] = ["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"];
export const ACTION_STATUSES: ActionStatus[] = ["Open", "Doing", "Done"];
export const PRIORITIES: Priority[] = ["High", "Medium", "Low"];
export const ROLES: Role[] = ["ADMIN", "EDITOR", "VIEWER", "GVCN"];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Quản trị",
  EDITOR: "Cán bộ nền nếp",
  VIEWER: "Người xem",
  GVCN: "GVCN",
};

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: "Đang học",
  TRANSFERRED_OUT: "Đã chuyển trường",
  GRADUATED: "Đã tốt nghiệp",
  INACTIVE: "Ngừng theo dõi",
};

export const DATA_CHECK_LABELS: Record<DataCheck, string> = {
  OK: "Hợp lệ",
  THIEU_TEN_HS: "Thiếu tên HS",
  REVIEW: "Cần rà soát",
};

export const RAG_LABELS: Record<RagStatus, string> = {
  GREEN: "Xanh – Ổn định",
  YELLOW: "Vàng – Cần chú ý",
  RED: "Đỏ – Cần can thiệp",
  GRAY: "Xám – Chưa đủ dữ liệu",
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  Open: "Mới mở",
  Doing: "Đang thực hiện",
  Done: "Hoàn thành",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  High: "Cao",
  Medium: "Trung bình",
  Low: "Thấp",
};

export const PERIOD_MODE_LABELS = {
  all: "Toàn bộ",
  week: "Tuần",
  month: "Tháng",
  semester: "Học kỳ",
} as const;

/** Default config for a level (school year 2026–2027, values from the NSHM workbooks + spec defaults). */
export function defaultLevelConfig(levelId: LevelId): LevelConfig {
  return {
    levelId,
    schoolYear: "2026-2027",
    baseScorePerWeek: 100,
    firstWeek: "2026-08-17",
    semesters: [
      { code: "HK1", name: "Học kỳ I", start: "2026-08-17", end: "2026-12-31" },
      { code: "HK2", name: "Học kỳ II", start: "2027-01-01", end: "2027-05-31" },
    ],
    rag: { yellow: 10, red: 25, approved: false, minConfidence: 0.8 },
    rewardCountedStatuses: ["Đã xác nhận"],
    top90Ratio: 0.9,
    studentAlert: { perWeek: 3, repeatWindowWeeks: 4, repeatMin: 2 },
    actionSlaDays: { High: 3, Medium: 7, Low: 14 },
  };
}

/** Default 5S-tagged error codes (configurable per level in Cài đặt → Danh mục lỗi). */
export const DEFAULT_5S_CODES = ["L03", "L04", "L11", "L14"];

/** Editors may edit their own incidents/rewards within this window (Admins: always). */
export const EDITOR_EDIT_WINDOW_HOURS = 24;

/* ------------------------------------------------------------------------- */
/* Permission matrix (02_PhanQuyen + GVCN role). Server MUST enforce;        */
/* client uses the same helpers only to hide/disable UI.                      */
/* ------------------------------------------------------------------------- */

export type Permission =
  | "view.dashboard" // Tổng quan, Xếp hạng, Khối & lớp (aggregate), Báo GVCN, Học sinh
  | "view.allClassesDetail" // student-level detail of every class (GVCN: own classes only)
  | "incident.create"
  | "reward.create"
  | "record.editOwnRecent" // edit own incidents/rewards within EDITOR_EDIT_WINDOW_HOURS
  | "record.editAny"
  | "record.delete" // soft delete + restore
  | "reward.verify" // change reward status
  | "incident.gvcnFeedback" // GVCN note/status on own-class incidents
  | "excel.import"
  | "excel.export"
  | "students.manage"
  | "audit.view"
  | "settings.manage" // config, RAG approval, catalog, classes, weeks
  | "users.manage"
  | "actions.manage"
  | "actions.view"
  | "data.inspect" // Dữ liệu & rà soát
  | "data.reset";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    "view.dashboard",
    "view.allClassesDetail",
    "incident.create",
    "reward.create",
    "record.editOwnRecent",
    "record.editAny",
    "record.delete",
    "reward.verify",
    "incident.gvcnFeedback",
    "excel.import",
    "excel.export",
    "students.manage",
    "audit.view",
    "settings.manage",
    "users.manage",
    "actions.manage",
    "actions.view",
    "data.inspect",
    "data.reset",
  ],
  EDITOR: [
    "view.dashboard",
    "view.allClassesDetail",
    "incident.create",
    "reward.create",
    "record.editOwnRecent",
    "actions.view",
    "data.inspect",
  ],
  VIEWER: ["view.dashboard", "view.allClassesDetail", "actions.view"],
  GVCN: ["view.dashboard", "incident.gvcnFeedback"],
};

/**
 * School-wide permissions: managing accounts and reading the audit log cover every level, so only profiles
 * WITHOUT a level restriction (`levels = []`) hold them. A level-limited ADMIN keeps the rest of the ADMIN
 * permissions for its own levels (settings, imports, maintenance are checked per level by the server).
 */
export const ALL_LEVEL_PERMISSIONS: readonly Permission[] = ["users.manage", "audit.view"];

export function hasPermission(
  profile: (Pick<UserProfile, "role" | "active"> & { levels?: readonly LevelId[] }) | null | undefined,
  p: Permission,
): boolean {
  if (!profile || !profile.active) return false;
  if (!MATRIX[profile.role].includes(p)) return false;
  if (ALL_LEVEL_PERMISSIONS.includes(p) && (profile.levels?.length ?? 0) > 0) return false;
  return true;
}

/** True for a profile without level restriction (`levels = []`); GVCN scope is their classes, never all levels. */
export function hasAllLevels(profile: Pick<UserProfile, "role" | "levels"> | null | undefined): boolean {
  return !!profile && profile.role !== "GVCN" && profile.levels.length === 0;
}

export function canAccessLevel(profile: Pick<UserProfile, "levels" | "role" | "gvcnClasses" | "active"> | null | undefined, levelId: LevelId): boolean {
  if (!profile || !profile.active) return false;
  if (profile.role === "GVCN") return profile.gvcnClasses.some((c) => c.levelId === levelId);
  return profile.levels.length === 0 || profile.levels.includes(levelId);
}

export function isGvcnOfClass(profile: Pick<UserProfile, "role" | "gvcnClasses"> | null | undefined, levelId: LevelId, classCode: string): boolean {
  if (!profile || profile.role !== "GVCN") return false;
  return profile.gvcnClasses.some((c) => c.levelId === levelId && c.classCode === classCode);
}

/** Can this user see student-level detail (names, notes) of a class? */
export function canSeeClassDetail(profile: Pick<UserProfile, "role" | "gvcnClasses" | "active" | "levels"> | null | undefined, levelId: LevelId, classCode: string): boolean {
  if (!profile || !profile.active) return false;
  if (!canAccessLevel(profile, levelId)) return false;
  if (hasPermission(profile, "view.allClassesDetail")) return true;
  return isGvcnOfClass(profile, levelId, classCode);
}
