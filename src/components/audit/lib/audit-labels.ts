/**
 * Vietnamese labels and colour categories of audit log actions / entities (SCR-10, FR-AUD-001/002).
 * Colour by kind: auth = muted, create = ok, update = brand, delete / reset = bad, import / export = star.
 */
import type { Tone } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import type { AuditAction, Role } from "@/lib/types";

export type AuditKind = "auth" | "create" | "update" | "delete" | "io";

export const AUDIT_KIND_TONE: Record<AuditKind, Tone> = {
  auth: "muted",
  create: "ok",
  update: "brand",
  delete: "bad",
  io: "star",
};

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  auth: "Đăng nhập",
  create: "Tạo mới",
  update: "Cập nhật",
  delete: "Xóa / đặt lại",
  io: "Nhập / xuất",
};

const G_AUTH = "Đăng nhập & tài khoản";
const G_INC = "Sự việc";
const G_REW = "Điểm thưởng";
const G_INS = "Đợt kiểm tra";
const G_STU = "Học sinh";
const G_IO = "Nhập / xuất dữ liệu";
const G_CFG = "Cấu hình";
const G_ACT = "Hành động";
const G_SYS = "Hệ thống";

export interface AuditActionMeta {
  label: string;
  kind: AuditKind;
  group: string;
}

/** Every AuditAction (the Record type keeps this list complete). Order = display order in the filter. */
export const AUDIT_ACTION_META: Record<AuditAction, AuditActionMeta> = {
  LOGIN: { label: "Đăng nhập", kind: "auth", group: G_AUTH },
  LOGIN_FAILED: { label: "Đăng nhập thất bại", kind: "auth", group: G_AUTH },
  LOGOUT: { label: "Đăng xuất", kind: "auth", group: G_AUTH },
  CREATE_USER: { label: "Tạo tài khoản", kind: "create", group: G_AUTH },
  UPDATE_USER: { label: "Sửa tài khoản", kind: "update", group: G_AUTH },
  RESET_PASSWORD: { label: "Đặt lại mật khẩu", kind: "delete", group: G_AUTH },
  CREATE_INCIDENT: { label: "Tạo sự việc", kind: "create", group: G_INC },
  UPDATE_INCIDENT: { label: "Sửa sự việc", kind: "update", group: G_INC },
  DELETE_INCIDENT: { label: "Xóa sự việc", kind: "delete", group: G_INC },
  RESTORE_INCIDENT: { label: "Khôi phục sự việc", kind: "update", group: G_INC },
  GVCN_FEEDBACK: { label: "Phản hồi / khắc phục sự việc", kind: "update", group: G_INC },
  UPLOAD_EVIDENCE: { label: "Tải ảnh minh chứng", kind: "create", group: G_INC },
  CREATE_REWARD: { label: "Tạo điểm thưởng", kind: "create", group: G_REW },
  UPDATE_REWARD: { label: "Sửa điểm thưởng", kind: "update", group: G_REW },
  DELETE_REWARD: { label: "Xóa điểm thưởng", kind: "delete", group: G_REW },
  RESTORE_REWARD: { label: "Khôi phục điểm thưởng", kind: "update", group: G_REW },
  CREATE_INSPECTION: { label: "Ghi đợt kiểm tra", kind: "create", group: G_INS },
  UPDATE_INSPECTION: { label: "Sửa đợt kiểm tra", kind: "update", group: G_INS },
  DELETE_INSPECTION: { label: "Xóa đợt kiểm tra", kind: "delete", group: G_INS },
  ADD_STUDENT: { label: "Thêm học sinh", kind: "create", group: G_STU },
  UPDATE_STUDENT: { label: "Sửa thông tin học sinh", kind: "update", group: G_STU },
  TRANSFER_STUDENT: { label: "Chuyển lớp", kind: "update", group: G_STU },
  WITHDRAW_STUDENT: { label: "Học sinh rời trường", kind: "delete", group: G_STU },
  REINSTATE_STUDENT: { label: "Tiếp nhận lại học sinh", kind: "update", group: G_STU },
  IMPORT_STUDENTS: { label: "Nhập danh sách học sinh", kind: "io", group: G_IO },
  IMPORT_EXCEL: { label: "Nhập dữ liệu Excel", kind: "io", group: G_IO },
  EXPORT_EXCEL: { label: "Xuất dữ liệu", kind: "io", group: G_IO },
  RESET_DATA: { label: "Đặt lại dữ liệu", kind: "delete", group: G_IO },
  UPDATE_CONFIG: { label: "Sửa cấu hình", kind: "update", group: G_CFG },
  UPDATE_CATALOG: { label: "Sửa danh mục lỗi", kind: "update", group: G_CFG },
  UPDATE_CLASSES: { label: "Sửa danh sách lớp", kind: "update", group: G_CFG },
  UPDATE_WEEKS: { label: "Sửa lịch tuần", kind: "update", group: G_CFG },
  CREATE_ACTION: { label: "Tạo hành động", kind: "create", group: G_ACT },
  UPDATE_ACTION: { label: "Cập nhật hành động", kind: "update", group: G_ACT },
  UPDATE_REPORT_PLAN: { label: "Cập nhật công tác phối hợp (báo cáo)", kind: "update", group: G_ACT },
  REBUILD_DIGESTS: { label: "Dựng lại dữ liệu tổng hợp", kind: "update", group: G_SYS },
};

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_META) as AuditAction[];

export function isAuditAction(v: string): v is AuditAction {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTION_META, v);
}

/** Vietnamese label (unknown codes from newer servers are shown as is). */
export function auditActionLabel(action: string): string {
  return isAuditAction(action) ? AUDIT_ACTION_META[action].label : action;
}

export function auditActionKind(action: string): AuditKind {
  if (isAuditAction(action)) return AUDIT_ACTION_META[action].kind;
  if (action.startsWith("CREATE_") || action.startsWith("ADD_")) return "create";
  if (action.startsWith("DELETE_") || action.startsWith("RESET_")) return "delete";
  if (action.startsWith("IMPORT_") || action.startsWith("EXPORT_")) return "io";
  return "update";
}

/** Badge tone by kind; a failed sign-in stands out in amber so repeated attempts are easy to spot. */
export function auditActionTone(action: string): Tone {
  if (action === "LOGIN_FAILED") return "warn";
  return AUDIT_KIND_TONE[auditActionKind(action)];
}

const ENTITY_LABELS: Record<string, string> = {
  incident: "Sự việc",
  reward: "Điểm thưởng",
  inspection: "Đợt kiểm tra",
  student: "Học sinh",
  user: "Tài khoản",
  action: "Hành động",
  evidence: "Ảnh minh chứng",
  importBatch: "Lô nhập dữ liệu",
  export: "Tệp xuất",
  digests: "Dữ liệu tổng hợp",
  config: "Cấu hình",
  catalog: "Danh mục lỗi",
  classes: "Danh sách lớp",
  weeks: "Lịch tuần",
  reportPlan: "Công tác phối hợp",
};

export function entityLabel(entity: string | undefined): string {
  if (!entity) return "";
  return ENTITY_LABELS[entity] ?? entity;
}

export const EXPORT_KIND_LABELS: Record<string, string> = {
  workbook: "Sổ dữ liệu Excel",
  html: "Báo cáo HTML",
  ranking: "Bảng xếp hạng",
  gvcn: "Báo cáo GVCN",
  students: "Danh sách học sinh",
  audit: "Nhật ký hệ thống",
  report: "Báo cáo tuần/tháng",
};

export function roleLabel(role: Role | "" | undefined): string {
  if (!role) return "Chưa xác thực";
  return ROLE_LABELS[role] ?? role;
}

export const ROLE_TONE: Record<Role, Tone> = { ADMIN: "brand", EDITOR: "ok", VIEWER: "muted", GVCN: "star" };

export function roleTone(role: Role | "" | undefined): Tone {
  return role ? (ROLE_TONE[role] ?? "muted") : "muted";
}

/** Filter options: grouped by domain, searchable by Vietnamese label and code. */
export function auditActionOptions(): Array<{ value: AuditAction; label: string; group: string; description: string; keywords: string[] }> {
  return AUDIT_ACTIONS.map((a) => ({
    value: a,
    label: AUDIT_ACTION_META[a].label,
    group: AUDIT_ACTION_META[a].group,
    description: a,
    keywords: [a, AUDIT_KIND_LABELS[AUDIT_ACTION_META[a].kind]],
  }));
}
