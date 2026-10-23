/**
 * API CONTRACT – the single agreement between route handlers (src/app/api/**) and the client (src/lib/client/api.ts).
 *
 * Envelope rules:
 * - Success: HTTP 200/201 with the documented response type as the JSON body (no wrapper).
 * - Error:   HTTP 4xx/5xx with body `ApiErrorBody` – `message` is Vietnamese and safe to show to users.
 * - Auth:    every endpoint except POST /api/auth/login-failed and GET /api/health requires
 *            `Authorization: Bearer <Firebase ID token>`.
 * - The server re-validates EVERY input with the schemas below and recomputes all derived fields
 *   (points, week, month, semester, grade, relatedStudentCount, dataCheck). Client values for derived
 *   fields are ignored.
 *
 * ENDPOINT MAP (method path → input → output, minimum permission from constants.ts):
 *  POST   /api/auth/session                 → {}                          → MeResponse               (any signed-in user; audit LOGIN)
 *  POST   /api/auth/login-failed            → LoginFailedSchema           → OkResponse               (public; audit LOGIN_FAILED; rate-limited)
 *  POST   /api/auth/logout                  → {}                          → OkResponse               (audit LOGOUT)
 *  GET    /api/me                           → –                           → MeResponse
 *  GET    /api/dataset?level=THCS           → If-None-Match: "<version>"  → LevelDataset | 304       (view.dashboard + level access; GVCN redacted)
 *  GET    /api/rankings?level&mode&key&classCode → –                      → RankingsResponse         (view.dashboard)
 *  POST   /api/incidents                    → IncidentCreateSchema (+notDuplicateOf) → Incident (201) (incident.create)
 *  GET    /api/incidents?level=THCS&deleted=1 → –                         → ListResponse<Incident>   (record.delete) soft-deleted items
 *  GET    /api/incidents/:id                → –                           → Incident                 (canSeeClassDetail)
 *  PATCH  /api/incidents/:id                → IncidentUpdateSchema        → Incident                 (record.editAny | own & recent)
 *  DELETE /api/incidents/:id                → DeleteSchema (JSON body)    → OkResponse               (record.delete; soft delete)
 *  POST   /api/incidents/:id/restore        → {}                          → Incident                 (record.delete)
 *  POST   /api/incidents/:id/feedback       → GvcnFeedbackSchema (+remediation) → Incident   (incident.gvcnFeedback & own class | incident.remediate | ADMIN)
 *  POST   /api/incidents/:id/not-duplicate  → NotDuplicateSchema          → ListResponse<Incident>   (data.inspect + level; marks every pair of {id} ∪ otherIds)
 *  POST   /api/rewards                      → RewardCreateSchema (points 1–5, reason ≥ 5) → Reward (201) (reward.propose; without reward.create: own class, status forced "Mới ghi nhận", proposed)
 *  GET    /api/rewards?level=THCS&deleted=1 → –                           → ListResponse<Reward>     (record.delete)
 *  PATCH  /api/rewards/:id                  → RewardUpdateSchema          → Reward                   (record.editAny | own & recent; status→"Đã xác nhận" needs reward.verify)
 *  DELETE /api/rewards/:id                  → DeleteSchema                → OkResponse               (record.delete)
 *  POST   /api/rewards/:id/restore          → {}                          → Reward                   (record.delete)
 *  POST   /api/evidence                     → EvidenceUploadSchema        → { id } (201)             (incident.create | reward.create | reward.propose)
 *  GET    /api/evidence/:id                 → –                           → image bytes              (level access)
 *  GET    /api/students/:id                 → –                           → Student                  (canSeeClassDetail of current class)
 *  POST   /api/students                     → StudentCreateSchema         → Student (201)            (students.manage; audit ADD_STUDENT)
 *  PATCH  /api/students/:id                 → StudentUpdateSchema         → Student                  (students.manage)
 *  POST   /api/students/:id/transfer        → StudentTransferSchema       → Student                  (students.manage; audit TRANSFER_STUDENT)
 *  POST   /api/students/:id/withdraw        → StudentWithdrawSchema       → Student                  (students.manage; audit WITHDRAW_STUDENT)
 *  POST   /api/students/:id/reinstate       → StudentReinstateSchema      → Student                  (students.manage)
 *  POST   /api/students/:id/promote-level   → StudentPromoteSchema        → Student                  (students.manage + both levels; chuyển cấp, same Mã HS)
 *  POST   /api/imports/students/preview     → StudentImportSchema         → StudentImportPreview     (students.manage)
 *  POST   /api/imports/students/commit      → StudentImportCommitSchema   → StudentImportResult      (students.manage; audit IMPORT_STUDENTS)
 *  POST   /api/imports/workbook/preview     → WorkbookPreviewSchema       → WorkbookPreview          (excel.import)
 *  POST   /api/imports/workbook/commit      → WorkbookCommitSchema        → WorkbookCommitResult     (excel.import; audit IMPORT_EXCEL)
 *  POST   /api/exports/log                  → ExportLogSchema             → OkResponse               (excel.export; audit EXPORT_EXCEL)
 *  POST   /api/inspections                  → InspectionCreateSchema      → Inspection (201)         (inspection.manage + level)
 *  PATCH  /api/inspections/:id              → InspectionUpdateSchema      → Inspection               (inspection.manage; ADMIN any, EDITOR own ≤ 24 h; baseRev → 409)
 *  DELETE /api/inspections/:id              → DeleteSchema                → OkResponse               (inspection.manage; ADMIN any, EDITOR own ≤ 24 h; soft delete)
 *  GET    /api/actions?level=THCS           → –                           → ListResponse<ActionItem> (actions.view)
 *  POST   /api/actions                      → ActionCreateSchema          → ActionItem (201)         (actions.manage)
 *  PATCH  /api/actions/:id                  → ActionUpdateSchema          → ActionItem               (actions.manage; Done requires evidence → 400)
 *  GET    /api/audit-logs?action&email&level&from&to&cursor&limit → –     → AuditLogPage             (audit.view)
 *  PUT    /api/settings/:level/config       → ConfigUpdateSchema          → LevelConfig              (settings.manage; audit UPDATE_CONFIG; 409 when an implicit calendar change hides records unless ?allowHidingRecords=1)
 *  PUT    /api/settings/:level/catalog      → CatalogPutSchema            → ListResponse<CatalogItem>(settings.manage)
 *  PUT    /api/settings/:level/classes      → ClassesPutSchema            → ListResponse<ClassInfo>  (settings.manage)
 *  PUT    /api/settings/:level/weeks        → WeeksPutSchema              → ListResponse<SchoolWeek> (settings.manage; 409 when removed weeks hold records unless ?allowHidingRecords=1)
 *  PUT    /api/settings/:level/early-warning → EarlyWarningPutSchema      → LevelConfig              (settings.manage; audit UPDATE_CONFIG)
 *  GET    /api/users                        → –                           → ListResponse<UserProfile>(users.manage)
 *  POST   /api/users                        → UserCreateSchema            → UserCreateResult (201)   (users.manage)
 *  PATCH  /api/users/:uid                   → UserUpdateSchema            → UserProfile              (users.manage)
 *  POST   /api/users/:uid/reset-password    → {}                          → { tempPassword: string } (users.manage)
 *  POST   /api/users/bulk-gvcn              → BulkGvcnSchema              → BulkGvcnResult           (users.manage)
 *  POST   /api/admin/rebuild-digests        → RebuildSchema               → OkResponse               (settings.manage)
 *  POST   /api/admin/reset-level            → ResetLevelSchema            → { batchId: string; incidents: number; rewards: number } (data.reset)
 *  POST   /api/admin/restore-reset          → RestoreResetSchema          → { incidents: number; rewards: number } (data.reset)
 *  POST   /api/admin/evidence                → EvidenceMaintenanceSchema   → EvidenceMaintenanceResult (data.reset; dryRun = statistics only)
 *  GET    /api/health                       → –                           → { ok: true; time: string }
 */
import { z } from "zod";
import { LEVEL_IDS } from "./constants";
import type {
  ActionItem,
  AuditLog,
  ClassInfo,
  GradeRanking,
  LevelId,
  Period,
  Student,
  StudentLite,
  UserProfile,
} from "./types";

/* ------------------------------- primitives ------------------------------- */

export const zLevelId = z.enum(LEVEL_IDS as [LevelId, ...LevelId[]]);
export const zIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng yyyy-mm-dd")
  .refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")), "Ngày không hợp lệ");
export const zStudentId = z.string().trim().min(1, "Thiếu mã HS").max(32);
export const zClassCode = z.string().trim().min(1, "Thiếu lớp").max(20);
const zUrl = z.string().trim().url("Đường dẫn minh chứng không hợp lệ").max(1000);
const zText = (max: number) => z.string().trim().max(max);

/* -------------------------------- incidents ------------------------------- */

export const IncidentCreateSchema = z.object({
  levelId: zLevelId,
  date: zIsoDate,
  classCode: zClassCode,
  errorCode: z.string().trim().min(1, "Chưa chọn lỗi").max(20),
  scope: z.enum(["Cá nhân", "Tập thể"]),
  /** "/lần" only; ignored (forced to 1) for "/HS". */
  occurrenceCount: z.number().int().min(1).max(100).default(1),
  /** Named students (must currently belong to classCode and be ACTIVE). */
  studentIds: z.array(zStudentId).max(80).default([]),
  /** "/HS" + scope "Tập thể" only: number of students whose names are unknown. Forced to 0 otherwise. */
  unnamedCount: z.number().int().min(0).max(80).default(0),
  reporter: zText(120).optional(),
  evidenceUrls: z.array(zUrl).max(5).default([]),
  photoIds: z.array(z.string().max(80)).max(5).default([]),
  status: z.enum(["Mới ghi nhận", "Đang xử lý", "Đã đóng"]).default("Mới ghi nhận"),
  detail: zText(2000).optional(),
  /** Idempotency key generated by the client per form submission (uuid). Same key → same incident returned. */
  clientRequestId: z.string().min(8).max(64).optional(),
  /** "Không trùng, vẫn lưu": doc ids of existing incidents of the same level confirmed as NOT duplicates of this one. */
  notDuplicateOf: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
export type IncidentCreateInput = z.input<typeof IncidentCreateSchema>;

/** `rev` of the incident the form was opened from (absent → 0). A different current `rev` → 409 (stale edit). */
const zBaseRev = z.number().int().min(0).optional();

export const IncidentUpdateSchema = IncidentCreateSchema.omit({ levelId: true, clientRequestId: true, notDuplicateOf: true })
  .partial()
  .extend({ baseRev: zBaseRev });
export type IncidentUpdateInput = z.input<typeof IncidentUpdateSchema>;

export const DeleteSchema = z.object({ reason: z.string().trim().min(3, "Nhập lý do xóa (tối thiểu 3 ký tự)").max(500) });
export type DeleteInput = z.input<typeof DeleteSchema>;

export const GvcnFeedbackSchema = z
  .object({
    note: zText(1000).optional(),
    status: z.enum(["Mới ghi nhận", "Đang xử lý", "Đã đóng"]).optional(),
    /** Biện pháp xử lý / khắc phục ("" clears it). */
    remediation: zText(1000).optional(),
  })
  .refine(
    (v) => v.note !== undefined || v.status !== undefined || v.remediation !== undefined,
    "Cần nhập phản hồi, biện pháp khắc phục hoặc trạng thái",
  );
export type GvcnFeedbackInput = z.input<typeof GvcnFeedbackSchema>;

/** "Không trùng": doc ids of incidents of the same level reviewed as NOT duplicates of the incident in the URL. */
export const NotDuplicateSchema = z.object({
  otherIds: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});
export type NotDuplicateInput = z.input<typeof NotDuplicateSchema>;

/* --------------------------------- rewards -------------------------------- */

export const RewardCreateSchema = z.object({
  levelId: zLevelId,
  date: zIsoDate,
  classCode: zClassCode,
  /** Mức điểm cộng: số nguyên 1–5 (REWARD_POINT_LEVELS). */
  points: z.number().int("Mức điểm cộng là số nguyên từ 1 đến 5").min(1, "Mức điểm cộng từ 1 đến 5").max(5, "Mức điểm cộng từ 1 đến 5"),
  /** Lý do cộng điểm (bắt buộc). */
  reason: z.string().trim().min(5, "Nhập lý do cộng điểm (tối thiểu 5 ký tự)").max(500),
  reporter: zText(120).optional(),
  evidenceUrls: z.array(zUrl).max(5).default([]),
  photoIds: z.array(z.string().max(80)).max(5).default([]),
  note: zText(1000).optional(),
  /** EDITOR may only use "Mới ghi nhận" | "Đang xác minh"; "Đã xác nhận" requires reward.verify. Forced to "Mới ghi nhận" for proposals. */
  status: z.enum(["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"]).default("Mới ghi nhận"),
  clientRequestId: z.string().min(8).max(64).optional(),
});
export type RewardCreateInput = z.input<typeof RewardCreateSchema>;

/** Edits keep legacy values valid while unchanged; the service applies the create rules to CHANGED points / reason. */
export const RewardUpdateSchema = RewardCreateSchema.omit({ levelId: true, clientRequestId: true, points: true, reason: true })
  .partial()
  .extend({
    points: z.number().positive("Điểm thưởng phải > 0").max(100).optional(),
    reason: z.string().trim().min(3, "Nhập lý do cộng điểm").max(500).optional(),
    baseRev: zBaseRev,
  });
export type RewardUpdateInput = z.input<typeof RewardUpdateSchema>;

/* -------------------------------- evidence -------------------------------- */

export const EvidenceUploadSchema = z.object({
  levelId: zLevelId,
  /** data URL of an image already compressed client-side (max ~1280px, JPEG/WebP). Decoded size must be <= 700 KB. */
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Chỉ nhận ảnh JPEG/PNG/WebP").max(1_000_000),
  fileName: zText(200).optional(),
});
export type EvidenceUploadInput = z.input<typeof EvidenceUploadSchema>;

/* -------------------------------- students -------------------------------- */

export const StudentCreateSchema = z.object({
  levelId: zLevelId,
  id: zStudentId,
  name: z.string().trim().min(2, "Nhập họ tên").max(120),
  dob: zIsoDate.optional(),
  gender: zText(20).optional(),
  classCode: zClassCode,
  enrollDate: zIsoDate,
  /** NEW = tuyển mới; TRANSFER_IN = chuyển đến */
  enrollType: z.enum(["NEW", "TRANSFER_IN"]),
  note: zText(500).optional(),
});
export type StudentCreateInput = z.input<typeof StudentCreateSchema>;

export const StudentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  dob: zIsoDate.optional(),
  gender: zText(20).optional(),
  note: zText(500).optional(),
});
export type StudentUpdateInput = z.input<typeof StudentUpdateSchema>;

export const StudentTransferSchema = z.object({
  toClassCode: zClassCode,
  effectiveDate: zIsoDate,
  note: zText(500).optional(),
});
export type StudentTransferInput = z.input<typeof StudentTransferSchema>;

export const StudentWithdrawSchema = z.object({
  date: zIsoDate,
  status: z.enum(["TRANSFERRED_OUT", "GRADUATED", "INACTIVE"]).default("TRANSFERRED_OUT"),
  reason: z.string().trim().min(2, "Nhập lý do / nơi chuyển đến").max(300),
  note: zText(500).optional(),
});
export type StudentWithdrawInput = z.input<typeof StudentWithdrawSchema>;

export const StudentReinstateSchema = z.object({
  classCode: zClassCode,
  date: zIsoDate,
  note: zText(500).optional(),
});
export type StudentReinstateInput = z.input<typeof StudentReinstateSchema>;

/** Chuyển cấp (TH → THCS, THCS → THPT…): the student keeps the school-wide Mã HS and their history. */
export const StudentPromoteSchema = z.object({
  toLevelId: zLevelId,
  classCode: zClassCode,
  date: zIsoDate,
  note: zText(500).optional(),
});
export type StudentPromoteInput = z.input<typeof StudentPromoteSchema>;

export const RosterRowSchema = z.object({
  rowNumber: z.number().int().optional(),
  id: z.string().trim().max(32),
  name: z.string().trim().max(120),
  dob: z.string().trim().max(10).optional(), // yyyy-mm-dd or ""
  gender: zText(20).optional(),
  classCode: z.string().trim().max(20),
  statusText: zText(60).optional(), // free text from source file ("Đang học", "Chuyển đến HKI", ...)
});
export type RosterRow = z.infer<typeof RosterRowSchema>;

export const StudentImportSchema = z.object({
  levelId: zLevelId,
  /** upsert: add new + update existing. sync: same as upsert AND list ACTIVE students missing from the file. */
  mode: z.enum(["upsert", "sync"]),
  effectiveDate: zIsoDate,
  rows: z.array(RosterRowSchema).max(6000),
});
export type StudentImportInput = z.input<typeof StudentImportSchema>;

export const StudentImportCommitSchema = StudentImportSchema.extend({
  previewHash: z.string().min(8),
  /** sync mode: mark missing ACTIVE students as TRANSFERRED_OUT */
  applyMissingAsWithdrawn: z.boolean().default(false),
});
export type StudentImportCommitInput = z.input<typeof StudentImportCommitSchema>;

export type StudentImportRowKind = "NEW" | "UPDATE" | "TRANSFER" | "UNCHANGED" | "REINSTATE" | "INVALID";

export interface StudentImportPreview {
  previewHash: string;
  summary: Record<StudentImportRowKind, number> & { total: number; missing: number };
  rows: Array<{
    rowNumber?: number;
    id: string;
    name: string;
    classCode: string;
    kind: StudentImportRowKind;
    changes: string[]; // Vietnamese descriptions e.g. "Lớp: 6A01 → 6A02"
    errors: string[];
  }>;
  missing: StudentLite[]; // sync mode only
}

export interface StudentImportResult {
  created: number;
  updated: number;
  transferred: number;
  reinstated: number;
  withdrawn: number;
  skipped: number;
}

/* -------------------------------- workbook -------------------------------- */

export const ImportedClassSchema = z.object({
  code: zClassCode,
  grade: z.number().int().min(1).max(12),
  system: zText(40).optional(),
  homeroomTeacher: zText(400).optional(),
  deputyTeacher: zText(200).optional(),
  homeroomPhone: zText(30).optional(),
  homeroomEmail: zText(120).optional(),
  sourceSize: z.number().int().min(0).max(200).optional(),
});
export type ImportedClass = z.infer<typeof ImportedClassSchema>;

export const ImportedCatalogSchema = z.object({
  code: z.string().trim().min(1).max(20),
  category: zText(200),
  issue: zText(500),
  group: zText(60).optional(),
  penalty: z.number().min(0).max(1000),
  unit: z.enum(["/HS", "/lần"]),
  displayName: zText(600).optional(),
});
export type ImportedCatalog = z.infer<typeof ImportedCatalogSchema>;

export const ImportedWeekSchema = z.object({
  weekStart: zIsoDate,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  semester: zText(10),
});
export type ImportedWeek = z.infer<typeof ImportedWeekSchema>;

export const ImportedConfigSchema = z.object({
  baseScorePerWeek: z.number().min(0).max(10000).optional(),
  firstWeek: zIsoDate.optional(),
  hk1Start: zIsoDate.optional(),
  hk1End: zIsoDate.optional(),
  hk2Start: zIsoDate.optional(),
  hk2End: zIsoDate.optional(),
});
export type ImportedConfig = z.infer<typeof ImportedConfigSchema>;

export const ImportedIncidentSchema = z.object({
  rowNumber: z.number().int(),
  code: z.string().trim().max(40), // "NN-20260923-0001" (may be "" → server generates)
  date: z.string().trim().max(10), // yyyy-mm-dd or "" (→ ERROR)
  classCode: z.string().trim().max(20),
  errorCode: z.string().trim().max(20), // "L04" extracted from "… | L04" choice text
  errorText: zText(800).optional(),
  occurrenceCount: z.number().int().min(0).max(1000).optional(),
  pointsInFile: z.number().optional(),
  scope: zText(40).optional(),
  reporter: zText(120).optional(),
  evidence: zText(1000).optional(),
  status: zText(60).optional(),
  detail: zText(2000).optional(),
  legacyCheckText: zText(500).optional(), // value of "Kiểm tra dữ liệu" when it is not a standard flag
  /** "Số HS không rõ tên" column (only in workbooks exported by this app; legacy files have none). */
  unnamedCount: z.number().int().min(0).max(80).optional(),
});
export type ImportedIncident = z.infer<typeof ImportedIncidentSchema>;

export const ImportedLinkSchema = z.object({
  rowNumber: z.number().int(),
  incidentCode: z.string().trim().max(40),
  studentId: z.string().trim().max(32).optional(),
  studentName: zText(120).optional(),
  studentClass: z.string().trim().max(20).optional(),
  note: zText(500).optional(),
});
export type ImportedLink = z.infer<typeof ImportedLinkSchema>;

export const ImportedRewardSchema = z.object({
  rowNumber: z.number().int(),
  code: z.string().trim().max(40).optional(),
  date: z.string().trim().max(10),
  classCode: z.string().trim().max(20),
  reason: zText(500),
  points: z.number(),
  reporter: zText(120).optional(),
  evidence: zText(1000).optional(),
  note: zText(1000).optional(),
  status: zText(60).optional(),
});
export type ImportedReward = z.infer<typeof ImportedRewardSchema>;

/** Normalised content of one NSHM workbook (produced by src/lib/excel/parse-workbook.ts). */
export const WorkbookPayloadSchema = z.object({
  levelId: zLevelId,
  sourceFileName: zText(300),
  classes: z.array(ImportedClassSchema).max(300),
  catalog: z.array(ImportedCatalogSchema).max(300),
  config: ImportedConfigSchema.optional(),
  weeks: z.array(ImportedWeekSchema).max(80),
  students: z.array(RosterRowSchema).max(6000),
  incidents: z.array(ImportedIncidentSchema).max(10000),
  links: z.array(ImportedLinkSchema).max(30000),
  rewards: z.array(ImportedRewardSchema).max(5000),
});
export type WorkbookPayload = z.infer<typeof WorkbookPayloadSchema>;

export const WorkbookImportOptionsSchema = z.object({
  classes: z.boolean().default(true),
  catalog: z.boolean().default(true),
  config: z.boolean().default(false), // never overwrite approved config unless explicitly chosen (IO-04/IO-06)
  weeks: z.boolean().default(true),
  students: z.boolean().default(true),
  incidents: z.boolean().default(true),
  rewards: z.boolean().default(true),
});
export type WorkbookImportOptions = z.input<typeof WorkbookImportOptionsSchema>;

export const WorkbookPreviewSchema = z.object({
  payload: WorkbookPayloadSchema,
  options: WorkbookImportOptionsSchema.default({}),
  /**
   * Records / students changed in the app since their last import (GVCN feedback, review fixes, transfers…) are
   * skipped with a WARNING, and rows whose code belongs to a different record (other class / error) are ERROR rows,
   * unless the admin explicitly chooses to overwrite them with the file ("Ghi đè thay đổi trong phần mềm").
   * Send the same value to preview and commit (it is part of the preview hash).
   */
  overwriteAppChanges: z.boolean().optional(),
  /**
   * Re-score stored incidents that are in the file with the CURRENT error table (the file's "Bảng điểm lỗi" when that
   * section is imported) instead of the penalty/unit they were recorded with – for a rule the school changed
   * retroactively ("Tính lại sự việc đã ghi theo bảng điểm mới"). Same value for preview and commit (preview hash).
   */
  rescoreExisting: z.boolean().optional(),
});
export type WorkbookPreviewInput = z.input<typeof WorkbookPreviewSchema>;

export const WorkbookCommitSchema = WorkbookPreviewSchema.extend({ previewHash: z.string().min(8) });
export type WorkbookCommitInput = z.input<typeof WorkbookCommitSchema>;

export type RowSeverity = "OK" | "WARNING" | "ERROR";

export interface WorkbookRowReport {
  sheet: "Danh mục" | "Bảng điểm lỗi" | "Cấu hình" | "Lịch tuần" | "DS Học sinh" | "Nhập liệu" | "HS liên quan" | "Điểm thưởng";
  rowNumber: number;
  key: string; // e.g. incident code, student id, class code
  severity: RowSeverity;
  messages: string[]; // Vietnamese
  computedPoints?: number;
  pointsInFile?: number;
}

export interface WorkbookSectionSummary {
  total: number;
  ok: number;
  warning: number;
  error: number;
  willCreate: number;
  willUpdate: number;
  willSkip: number; // ERROR rows + identical existing rows
}

export interface WorkbookPreview {
  levelId: LevelId;
  previewHash: string;
  sections: Record<"classes" | "catalog" | "config" | "weeks" | "students" | "incidents" | "links" | "rewards", WorkbookSectionSummary>;
  /** Only WARNING and ERROR rows (OK rows are summarised in `sections`). */
  issues: WorkbookRowReport[];
}

export interface WorkbookCommitResult {
  batchId: string;
  created: Record<string, number>;
  updated: Record<string, number>;
  skipped: Record<string, number>;
  review: number; // incidents committed with dataCheck = REVIEW
}

export const ExportLogSchema = z.object({
  levelId: zLevelId.optional(),
  kind: z.enum(["workbook", "html", "ranking", "gvcn", "students", "audit", "report"]),
  detail: z.record(z.unknown()).optional(),
});
export type ExportLogInput = z.input<typeof ExportLogSchema>;

/* --------------------------------- actions -------------------------------- */

export const ActionCreateSchema = z.object({
  levelId: zLevelId,
  title: z.string().trim().min(3, "Nhập nội dung hành động").max(300),
  description: zText(2000).optional(),
  priority: z.enum(["High", "Medium", "Low"]),
  owner: z.string().trim().min(2, "Nhập người chịu trách nhiệm").max(120),
  deadline: zIsoDate,
  sourceWeek: zIsoDate.optional(),
  scopeClass: z.string().trim().max(20).optional(),
});
export type ActionCreateInput = z.input<typeof ActionCreateSchema>;

export const ActionUpdateSchema = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  description: zText(2000).optional(),
  priority: z.enum(["High", "Medium", "Low"]).optional(),
  owner: z.string().trim().min(2).max(120).optional(),
  deadline: zIsoDate.optional(),
  evidence: zText(2000).optional(),
  status: z.enum(["Open", "Doing", "Done"]).optional(),
  note: zText(500).optional(), // appended to history
});
export type ActionUpdateInput = z.input<typeof ActionUpdateSchema>;

/* ------------------------------ inspections ------------------------------ */

export const InspectionCreateSchema = z.object({
  levelId: zLevelId,
  date: zIsoDate,
  /** "" = không ghi buổi. */
  shift: z.enum(["Sáng", "Chiều", ""]).optional(),
  /** Mảng kiểm tra (catalog category); "" / omitted = kiểm tra chung. */
  category: zText(200).optional(),
  /** Classes inspected (server deduplicates; each must exist and be active). */
  classCodes: z.array(zClassCode).min(1, "Chọn ít nhất 1 lớp được kiểm tra").max(300),
  /** Người kiểm tra; empty → the creator's display name. */
  inspector: zText(120).optional(),
  note: zText(1000).optional(),
  clientRequestId: z.string().min(8).max(64).optional(),
});
export type InspectionCreateInput = z.input<typeof InspectionCreateSchema>;

export const InspectionUpdateSchema = InspectionCreateSchema.omit({ levelId: true, clientRequestId: true }).partial().extend({ baseRev: zBaseRev });
export type InspectionUpdateInput = z.input<typeof InspectionUpdateSchema>;

/* ------------------------------ early warning ----------------------------- */

export const EarlyWarningPutSchema = z.object({
  risingPct: z.number().int().min(10).max(500),
  risingMinPoints: z.number().min(0).max(1000),
  risingBaselineWeeks: z.number().int().min(1).max(12),
  prolongedWeeks: z.number().int().min(2).max(12),
  seriousGroups: z.array(z.string().trim().min(1).max(60)).max(10),
  seriousMinPenalty: z.number().min(0).max(1000),
});
export type EarlyWarningPutInput = z.input<typeof EarlyWarningPutSchema>;

/* -------------------------------- settings -------------------------------- */

/**
 * Removing calendar weeks (PUT weeks, or a config change while the calendar is generated from the config) hides
 * every record of those weeks from statistics. The server refuses with 409 CONFLICT (records listed in
 * `details: { weeks, incidents, rewards }`) unless the admin confirmed by repeating the same request with the query
 * parameter `?allowHidingRecords=1` (e.g. at the school-year rollover).
 */
export const ConfigUpdateSchema = z.object({
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  baseScorePerWeek: z.number().min(0).max(10000).optional(),
  firstWeek: zIsoDate.optional(),
  semesters: z
    .array(z.object({ code: z.string().trim().min(1).max(10), name: zText(60), start: zIsoDate, end: zIsoDate }))
    .min(1)
    .max(4)
    .optional(),
  rag: z
    .object({
      yellow: z.number().min(0).max(1000),
      red: z.number().min(0).max(1000),
      approved: z.boolean(),
      minConfidence: z.number().min(0).max(1),
    })
    .refine((r) => r.red > r.yellow, "Ngưỡng Đỏ phải lớn hơn ngưỡng Vàng")
    .optional(),
  rewardCountedStatuses: z.array(z.enum(["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"])).optional(),
  top90Ratio: z.number().min(0.5).max(1).optional(),
  studentAlert: z
    .object({
      perWeek: z.number().int().min(1).max(20),
      repeatWindowWeeks: z.number().int().min(1).max(20),
      repeatMin: z.number().int().min(2).max(20),
    })
    .optional(),
  actionSlaDays: z.object({ High: z.number().int().min(1), Medium: z.number().int().min(1), Low: z.number().int().min(1) }).optional(),
});
export type ConfigUpdateInput = z.input<typeof ConfigUpdateSchema>;

export const CatalogItemSchema = z.object({
  code: z.string().trim().min(1).max(20),
  category: z.string().trim().min(1).max(200),
  issue: z.string().trim().min(1).max(500),
  group: zText(60).optional(),
  penalty: z.number().min(0).max(1000),
  unit: z.enum(["/HS", "/lần"]),
  displayName: zText(600).optional(),
  is5S: z.boolean(),
  active: z.boolean(),
});
export const CatalogPutSchema = z.object({ items: z.array(CatalogItemSchema).min(1).max(300) });
export type CatalogPutInput = z.input<typeof CatalogPutSchema>;

export const ClassItemSchema = z.object({
  code: zClassCode,
  grade: z.number().int().min(1).max(12),
  system: zText(40).optional(),
  homeroomTeacher: zText(400).optional(),
  deputyTeacher: zText(200).optional(),
  homeroomPhone: zText(30).optional(),
  homeroomEmail: zText(120).optional(),
  sourceSize: z.number().int().min(0).max(200).optional(),
  active: z.boolean(),
  order: z.number().int().min(0),
});
export const ClassesPutSchema = z.object({ items: z.array(ClassItemSchema).min(1).max(300) });
export type ClassesPutInput = z.input<typeof ClassesPutSchema>;

export const WeekItemSchema = z.object({
  weekStart: zIsoDate,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  semester: zText(10),
  counted: z.boolean(),
  note: zText(200).optional(),
});
/** Either replace the list, or `regenerate: true` to rebuild Mondays from config.firstWeek → last semester end (counted=true). */
export const WeeksPutSchema = z.union([
  z.object({ items: z.array(WeekItemSchema).min(1).max(80) }),
  z.object({ regenerate: z.literal(true) }),
]);
export type WeeksPutInput = z.input<typeof WeeksPutSchema>;

/* ---------------------------------- users --------------------------------- */

const zGvcnClass = z.object({ levelId: zLevelId, classCode: zClassCode });

export const UserCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER", "GVCN"]),
  levels: z.array(zLevelId).default([]),
  gvcnClasses: z.array(zGvcnClass).default([]),
  /** omitted → server generates a temporary password returned once in the response */
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(128).optional(),
});
export type UserCreateInput = z.input<typeof UserCreateSchema>;

export const UserUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER", "GVCN"]).optional(),
  levels: z.array(zLevelId).optional(),
  gvcnClasses: z.array(zGvcnClass).optional(),
  active: z.boolean().optional(),
});
export type UserUpdateInput = z.input<typeof UserUpdateSchema>;

export interface UserCreateResult {
  profile: UserProfile;
  tempPassword?: string; // shown once
}

export const BulkGvcnSchema = z.object({
  levelId: zLevelId,
  /** Also remove this level's GVCN class assignments that no longer match the class list (homeroom changes). */
  sync: z.boolean().default(false),
});
export type BulkGvcnInput = z.input<typeof BulkGvcnSchema>;
export interface BulkGvcnResult {
  created: Array<{ email: string; displayName: string; classCode: string; tempPassword: string }>;
  linkedExisting: Array<{ email: string; classCode: string }>;
  skipped: Array<{ classCode: string; reason: string }>;
  /** sync mode: class assignments removed from accounts that are no longer the homeroom teacher. */
  unassigned?: Array<{ email: string; classCode: string }>;
}

/* ---------------------------------- admin --------------------------------- */

export const RebuildSchema = z.object({ levelId: zLevelId.optional() });
export const ResetLevelSchema = z.object({
  levelId: zLevelId,
  /** must equal `XOA ${levelId}` exactly, e.g. "XOA THCS" */
  confirmText: z.string(),
});
export const RestoreResetSchema = z.object({ levelId: zLevelId, batchId: z.string().min(4) });

/** Evidence photos of a level: statistics, and (dryRun=false) deletion of photos never attached to a record. */
export const EvidenceMaintenanceSchema = z.object({ levelId: zLevelId, dryRun: z.boolean().default(true) });
export interface EvidenceMaintenanceResult {
  levelId: LevelId;
  dryRun: boolean;
  total: number;
  totalBytes: number;
  attached: number;
  /** Not attached to any incident/reward and older than the grace period (deleted unless dryRun). */
  orphaned: number;
  orphanedBytes: number;
  deleted: number;
}

/* ---------------------------------- auth ---------------------------------- */

export const LoginFailedSchema = z.object({ email: z.string().trim().max(200), reason: zText(200).optional() });

/* -------------------------------- responses ------------------------------- */

export interface ApiErrorBody {
  error: {
    code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL";
    message: string; // Vietnamese
    details?: unknown; // e.g. zod issues: Array<{ path: string; message: string }>
  };
}

export interface OkResponse {
  ok: true;
}

export interface ListResponse<T> {
  items: T[];
}

export interface MeResponse {
  profile: UserProfile;
  accessibleLevels: LevelId[];
}

export interface RankingsResponse {
  levelId: LevelId;
  period: Period;
  countedWeeks: number;
  grades: GradeRanking[];
}

export interface AuditLogPage {
  items: AuditLog[];
  nextCursor?: string;
}

/** Re-exports for convenience */
export type { ActionItem, ClassInfo, Student };
