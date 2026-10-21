/**
 * NSHM – Nền nếp: domain types shared by engine, server and client.
 *
 * CONVENTIONS (binding for every module):
 * - Calendar dates are strings "yyyy-mm-dd" interpreted in Asia/Ho_Chi_Minh (no time part).
 * - Timestamps are ISO-8601 UTC strings (new Date().toISOString()).
 * - A school week starts on MONDAY; `week` fields hold that Monday's date "yyyy-mm-dd".
 * - A week belongs to the month of its Monday ("yyyy-mm") and to the semester whose range contains its Monday.
 * - Optional fields are omitted (never null) when written to Firestore.
 */

export type LevelId = "TH" | "THCS" | "THPT";
export type Role = "ADMIN" | "EDITOR" | "VIEWER" | "GVCN";
export type Unit = "/HS" | "/lần";
export type Scope = "Cá nhân" | "Tập thể";
export type IncidentStatus = "Mới ghi nhận" | "Đang xử lý" | "Đã đóng";
export type RewardStatus = "Mới ghi nhận" | "Đang xác minh" | "Đã xác nhận";
export type StudentStatus = "ACTIVE" | "TRANSFERRED_OUT" | "GRADUATED" | "INACTIVE";
export type RagStatus = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type ActionStatus = "Open" | "Doing" | "Done";
export type Priority = "High" | "Medium" | "Low";

/**
 * Data quality of an incident.
 * - OK: complete and reliable.
 * - THIEU_TEN_HS: a "/HS" error where some students were counted via `unnamedCount` (names unknown).
 *   Points ARE counted (decision of NSHM); the record is flagged for review only.
 * - REVIEW: unreliable (e.g. imported "/HS" incident with 0 students, student linked to wrong class,
 *   imported points mismatch). Points are still computed by the rule (may be 0) but the record lowers
 *   Data Confidence and may turn RAG gray. Shown in the "Rà soát dữ liệu" queue.
 */
export type DataCheck = "OK" | "THIEU_TEN_HS" | "REVIEW";

export type DataIssueCode =
  | "MISSING_STUDENTS" // /HS incident with relatedStudentCount = 0
  | "UNNAMED_STUDENTS" // unnamedCount > 0
  | "STUDENT_WRONG_CLASS" // linked student is not in the incident's class
  | "STUDENT_NOT_FOUND" // linked student id/name not found in roster
  | "DUPLICATE_STUDENT" // same student linked twice to one incident
  | "POINTS_MISMATCH_IMPORT" // points in source file differ from rule-computed points
  | "UNKNOWN_ERROR_CODE"
  | "UNKNOWN_CLASS"
  | "INVALID_DATE"
  | "SCOPE_MISSING" // scope empty in source; defaulted
  | "LEGACY_NOTE" // free text found in a legacy check column, preserved for reviewers
  | "OTHER";

export interface DataIssue {
  code: DataIssueCode;
  message: string; // Vietnamese, human readable
}

export interface LevelMeta {
  id: LevelId;
  name: string; // "Tiểu học"
  short: string; // "TH"
  grades: number[];
}

export interface Semester {
  code: string; // "HK1"
  name: string; // "Học kỳ I"
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd
}

export interface LevelConfig {
  levelId: LevelId;
  schoolYear: string; // "2026-2027"
  baseScorePerWeek: number; // 100
  firstWeek: string; // Monday yyyy-mm-dd, first week counted for competition
  semesters: Semester[];
  rag: {
    yellow: number; // weekly penalty points threshold for YELLOW (default 10)
    red: number; // weekly penalty points threshold for RED (default 25)
    approved: boolean; // if false -> every class RAG = GRAY ("Ngưỡng chưa được phê duyệt")
    minConfidence: number; // 0..1; class data confidence below this -> GRAY (default 0.8)
  };
  rewardCountedStatuses: RewardStatus[]; // default ["Đã xác nhận"]
  top90Ratio: number; // default 0.9
  studentAlert: {
    perWeek: number; // student with >= this many incidents in one week -> red alert (default 3)
    repeatWindowWeeks: number; // recidivism window (default 4)
    repeatMin: number; // >= this many incidents within the window -> "tái phạm" (default 2)
  };
  actionSlaDays: Record<Priority, number>; // default { High: 3, Medium: 7, Low: 14 }
  /** Ngưỡng cảnh báo sớm (Cài đặt → Cảnh báo sớm). Absent → engine DEFAULT_EARLY_WARNING. */
  earlyWarning?: EarlyWarningConfig;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ClassInfo {
  code: string; // "6A01" (unique inside a level)
  levelId: LevelId;
  grade: number;
  system?: string; // "Hệ"
  homeroomTeacher?: string; // GVCN
  deputyTeacher?: string; // Phó CN
  homeroomPhone?: string;
  homeroomEmail?: string;
  sourceSize?: number; // sĩ số theo nguồn
  active: boolean;
  order: number; // display order inside the level
}

export interface CatalogItem {
  code: string; // "L01"
  category: string; // Mảng, e.g. "Chuyên cần – vệ sinh"
  issue: string; // Nội dung lỗi
  group?: string; // "Nhóm 1"
  penalty: number; // >= 0
  unit: Unit;
  displayName?: string;
  is5S: boolean; // counted in 5S tracking
  active: boolean;
}

export interface SchoolWeek {
  weekStart: string; // Monday yyyy-mm-dd
  month: string; // yyyy-mm (month of the Monday)
  semester: string; // "HK1" | "HK2" | "" (outside semesters)
  counted: boolean; // false for holiday weeks (not counted in base score)
  note?: string;
}

export interface StudentEvent {
  type: "ENROLL" | "TRANSFER_IN" | "TRANSFER_CLASS" | "TRANSFER_OUT" | "REINSTATE" | "UPDATE" | "IMPORT";
  date: string; // effective date yyyy-mm-dd
  fromClass?: string;
  toClass?: string;
  /** Level change (chuyển cấp, e.g. TH → THCS): the level the student came from / went to. */
  fromLevel?: LevelId;
  toLevel?: LevelId;
  note?: string;
  by: string; // email of actor
  at: string; // ISO timestamp
}

export interface Student {
  id: string; // Mã HS (always string, e.g. "99060001")
  name: string;
  dob?: string; // yyyy-mm-dd
  gender?: string;
  levelId: LevelId;
  classCode: string; // current class
  grade: number; // current grade
  status: StudentStatus;
  note?: string;
  enrolledAt?: string; // yyyy-mm-dd
  leftAt?: string; // yyyy-mm-dd (TRANSFERRED_OUT / GRADUATED)
  leftReason?: string;
  history: StudentEvent[];
  createdAt: string;
  updatedAt: string;
}

/** Compact student row used in datasets / digests. */
export interface StudentLite {
  id: string;
  name: string;
  dob?: string;
  classCode: string;
  grade: number;
  status: StudentStatus;
}

/** Snapshot of a student at the time an incident was recorded (keeps history after transfers). */
export interface StudentRef {
  id: string;
  name: string;
  classCode: string;
}

export interface Incident {
  id: string; // Firestore doc id = `${levelId}_${code}`
  code: string; // display code "NN-20260923-0001" (unique inside a level)
  levelId: LevelId;
  date: string; // yyyy-mm-dd
  week: string; // Monday of `date`
  month: string; // yyyy-mm of `week`
  semester: string; // from SchoolWeek/config ("" if outside)
  classCode: string;
  grade: number;
  // --- catalog snapshot at time of recording (never edited by hand) ---
  errorCode: string;
  category: string;
  issue: string;
  group?: string;
  penalty: number;
  unit: Unit;
  // ---
  scope: Scope;
  occurrenceCount: number; // >= 1, used for "/lần"
  students: StudentRef[]; // named students
  unnamedCount: number; // students counted without names ("/HS" only), >= 0
  relatedStudentCount: number; // students.length + unnamedCount
  points: number; // server-computed penalty points (BR-POINT-01/02)
  reporter?: string; // Người ghi
  evidenceUrls: string[];
  photoIds: string[]; // ids in `evidence` collection
  status: IncidentStatus;
  detail?: string;
  dataCheck: DataCheck;
  dataIssues: DataIssue[];
  gvcnNote?: string;
  gvcnNoteBy?: string;
  gvcnNoteAt?: string;
  /** Biện pháp xử lý / khắc phục. Omitted when empty. Set only through POST /api/incidents/:id/feedback. */
  remediation?: string;
  /** ISO timestamp of the last remediation change. */
  remediationAt?: string;
  /** Display name of the user who last changed the remediation. */
  remediationBy?: string;
  /** Doc ids of incidents reviewed as NOT duplicates of this one (a pair is reviewed when either side lists the other). */
  notDuplicateOf?: string[];
  source: "app" | "import";
  externalId?: string; // original code from imported workbook
  importBatchId?: string;
  createdBy: string; // uid
  createdByName: string; // display name/email for UI
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  deletedAt?: string; // soft delete (BR-DATA-02)
  deletedBy?: string;
  deleteReason?: string;
  /** Revision, incremented by every server-side mutation (optimistic concurrency: PATCH `baseRev`). Absent = 0. */
  rev?: number;
  /** Workbook import only: hash of the content the last import wrote (detects edits made in the app since). */
  importHash?: string;
}

export interface Reward {
  id: string; // `${levelId}_${code}`
  code: string; // "KT-20261021-0001"
  levelId: LevelId;
  date: string;
  week: string;
  month: string;
  semester: string;
  classCode: string;
  grade: number;
  points: number; // > 0
  reason: string; // Nội dung thưởng
  reporter?: string;
  evidenceUrls: string[];
  photoIds: string[];
  note?: string;
  status: RewardStatus;
  /** true when created by a GVCN through `reward.propose` (a proposal; counted only once its status is counted). */
  proposed?: boolean;
  source: "app" | "import";
  externalId?: string;
  importBatchId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
  /** Revision, incremented by every server-side mutation (optimistic concurrency: PATCH `baseRev`). Absent = 0. */
  rev?: number;
  /** Workbook import only: hash of the content the last import wrote (detects edits made in the app since). */
  importHash?: string;
}

export interface ActionHistoryEntry {
  at: string;
  by: string; // email
  fromStatus?: ActionStatus;
  toStatus?: ActionStatus;
  note?: string;
}

export interface ActionItem {
  id: string; // `${levelId}_${code}`
  code: string; // "HD-20261021-001"
  levelId: LevelId;
  title: string;
  description?: string;
  priority: Priority;
  owner: string;
  deadline: string; // yyyy-mm-dd
  evidence?: string; // required (non-empty) to be Done (BR-ACT-01)
  status: ActionStatus;
  sourceWeek?: string;
  scopeClass?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
  history: ActionHistoryEntry[];
}

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "CREATE_INCIDENT"
  | "UPDATE_INCIDENT"
  | "DELETE_INCIDENT"
  | "RESTORE_INCIDENT"
  | "GVCN_FEEDBACK"
  | "CREATE_REWARD"
  | "UPDATE_REWARD"
  | "DELETE_REWARD"
  | "RESTORE_REWARD"
  | "IMPORT_EXCEL"
  | "EXPORT_EXCEL"
  | "RESET_DATA"
  | "ADD_STUDENT"
  | "UPDATE_STUDENT"
  | "TRANSFER_STUDENT"
  | "WITHDRAW_STUDENT"
  | "REINSTATE_STUDENT"
  | "IMPORT_STUDENTS"
  | "UPDATE_CONFIG"
  | "UPDATE_CATALOG"
  | "UPDATE_CLASSES"
  | "UPDATE_WEEKS"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "RESET_PASSWORD"
  | "CREATE_ACTION"
  | "UPDATE_ACTION"
  | "UPLOAD_EVIDENCE"
  | "REBUILD_DIGESTS"
  | "CREATE_INSPECTION"
  | "UPDATE_INSPECTION"
  | "DELETE_INSPECTION";

export interface AuditLog {
  id: string;
  ts: string;
  uid: string; // "" for anonymous (LOGIN_FAILED)
  email: string;
  role: Role | "";
  action: AuditAction;
  entity?: string; // "incident" | "reward" | "student" | ...
  entityId?: string;
  levelId?: LevelId;
  detail?: Record<string, unknown>; // before/after or summary; JSON-serialisable
  ip?: string;
}

export interface GvcnClassRef {
  levelId: LevelId;
  classCode: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  levels: LevelId[]; // allowed levels; [] = all levels
  gvcnClasses: GvcnClassRef[]; // only meaningful for role GVCN
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  /**
   * ID tokens whose sign-in time (`auth_time`) is earlier than this ISO timestamp are rejected (set on password
   * reset, lock and when an existing Auth account is re-secured), so a session stolen before stays unusable.
   */
  sessionsValidAfter?: string;
}

/**
 * Everything the client needs to render all analytics for one level.
 * Built server-side from digest documents and filtered by role.
 */
export interface LevelDataset {
  levelId: LevelId;
  version: number; // meta/versions[levelId] at build time
  generatedAt: string;
  config: LevelConfig;
  classes: ClassInfo[];
  catalog: CatalogItem[];
  weeks: SchoolWeek[];
  students: StudentLite[]; // all statuses (needed to resolve history), GVCN: only own classes
  incidents: Incident[]; // non-deleted only
  rewards: Reward[]; // non-deleted only
  /** Inspection rounds of the calendar weeks, non-deleted (GVCN: `note` stripped). Absent → treat as []. */
  inspections?: Inspection[];
  /** true when the viewer is GVCN: student names/detail/notes of OTHER classes were stripped */
  redacted: boolean;
}

/* ----------------------------- Analytics types ----------------------------- */

export type PeriodMode = "all" | "week" | "month" | "semester";

export interface Period {
  mode: PeriodMode;
  /** week: Monday yyyy-mm-dd; month: yyyy-mm; semester: "HK1"; all: undefined */
  key?: string;
}

export interface GlobalFilters {
  period: Period;
  grade?: number;
  classCode?: string;
  category?: string; // Mảng
  errorCode?: string;
  group?: string; // Nhóm lỗi (catalog group, e.g. "Nhóm 3"): incidents whose snapshot `group` equals it
  studentId?: string; // Mã HS: incidents naming this student
}

export interface RankingRow {
  classCode: string;
  grade: number;
  homeroomTeacher?: string;
  countedWeeks: number;
  base: number; // baseScorePerWeek * countedWeeks
  rewardPoints: number; // only counted statuses
  penaltyPoints: number;
  score: number; // base + reward - penalty (BR-RANK-01), may be negative
  rank: number; // competition rank inside the grade (1,2,2,4)
  gradeClassCount: number;
  top90Cutoff: number; // ceil(top90Ratio * gradeClassCount)
  inTop90: boolean; // rank <= top90Cutoff (ties at cutoff are inside)
  incidentCount: number;
  relatedStudentCount: number;
  avgWeeklyPenalty: number;
  confidence: number; // 0..1
  rag: RagStatus;
  ragReason: string; // Vietnamese explanation
  highlighted: boolean; // selected by the class filter (population unchanged, BR-RANK-06)
}

export interface GradeRanking {
  grade: number;
  rows: RankingRow[]; // sorted by rank then classCode
}

/** Early-warning thresholds of a level (REQ_V2 §4.5). */
export interface EarlyWarningConfig {
  /** RISING_CLASS: reference-week penalty ≥ baseline average × (1 + risingPct / 100). Default 50. */
  risingPct: number;
  /** RISING_CLASS: minimum penalty points in the reference week. Default 6. */
  risingMinPoints: number;
  /** RISING_CLASS: counted weeks before the reference week used for the baseline average. Default 4. */
  risingBaselineWeeks: number;
  /** PROLONGED_ERROR: consecutive counted weeks with the same error code in a class. Default 3. */
  prolongedWeeks: number;
  /** SERIOUS_INCIDENT: catalog groups treated as serious. Default ["Nhóm 3", "Nhóm 4"]. */
  seriousGroups: string[];
  /** SERIOUS_INCIDENT: OR catalog penalty (per HS / per lần) ≥ this value; 0 disables this rule. Default 10. */
  seriousMinPenalty: number;
}

/** Buổi kiểm tra. */
export type InspectionShift = "Sáng" | "Chiều";

/** Đợt kiểm tra nền nếp (REQ_V2 §12): which classes were inspected, when, for which Mảng. */
export interface Inspection {
  id: string; // `${levelId}_${code}`
  code: string; // "DKT-20261021-001" (unique inside a level)
  levelId: LevelId;
  date: string; // yyyy-mm-dd
  week: string; // Monday of `date`
  month: string; // yyyy-mm of `week`
  semester: string; // "" if outside the semesters
  shift?: InspectionShift;
  /** Mảng kiểm tra (a catalog category); omitted = kiểm tra chung (mọi mảng). */
  category?: string;
  /** Classes inspected (unique, class display order). */
  classCodes: string[];
  /** Người kiểm tra (defaults to the creator's display name). */
  inspector: string;
  note?: string;
  createdBy: string; // uid
  createdByName: string;
  createdAt: string;
  updatedBy?: string; // email
  updatedAt?: string;
  deletedAt?: string; // soft delete
  deletedBy?: string;
  deleteReason?: string;
  /** Revision (optimistic concurrency, like incidents). Absent = 0. */
  rev?: number;
}
