/**
 * One-line summaries and before/after diffs of audit log details (FR-AUD-002). Pure; details are untyped
 * JSON written by many services, so every read is defensive.
 */
import { ACTION_STATUS_LABELS, PRIORITY_LABELS, ROLE_LABELS, STUDENT_STATUS_LABELS } from "@/lib/constants";
import { formatDateVN, formatNumberVN, isIsoDate } from "@/lib/engine";
import type { AuditLog } from "@/lib/types";
import { EXPORT_KIND_LABELS } from "./audit-labels";

type Detail = Record<string, unknown>;

export const SUMMARY_MAX = 140;

const FIELD_LABELS: Record<string, string> = {
  title: "nội dung",
  description: "mô tả",
  priority: "mức ưu tiên",
  owner: "người phụ trách",
  deadline: "hạn xử lý",
  evidence: "minh chứng",
  status: "trạng thái",
  date: "ngày",
  week: "tuần",
  classCode: "lớp",
  grade: "khối",
  errorCode: "mã lỗi",
  issue: "nội dung lỗi",
  penalty: "mức trừ",
  unit: "đơn vị",
  scope: "phạm vi",
  occurrenceCount: "số lần",
  students: "học sinh",
  studentIds: "học sinh",
  unnamedCount: "HS chưa rõ tên",
  relatedStudentCount: "số HS liên quan",
  points: "điểm",
  dataCheck: "kiểm tra dữ liệu",
  reporter: "người ghi",
  detail: "chi tiết",
  evidenceUrls: "liên kết minh chứng",
  photoIds: "ảnh minh chứng",
  gvcnNote: "phản hồi GVCN",
  remediation: "biện pháp khắc phục",
  notDuplicateOf: "đánh dấu không trùng",
  shift: "buổi",
  category: "mảng",
  classCodes: "lớp được kiểm tra",
  inspector: "người kiểm tra",
  earlyWarning: "ngưỡng cảnh báo sớm",
  proposed: "GVCN đề xuất",
  reason: "lý do / nội dung",
  note: "ghi chú",
  name: "họ tên",
  dob: "ngày sinh",
  gender: "giới tính",
  displayName: "tên hiển thị",
  role: "vai trò",
  levels: "cấp học",
  gvcnClasses: "lớp chủ nhiệm",
  active: "trạng thái tài khoản",
  schoolYear: "năm học",
  baseScorePerWeek: "điểm nền/tuần",
  firstWeek: "tuần đầu",
  semesters: "học kỳ",
  rag: "ngưỡng RAG",
  rewardCountedStatuses: "trạng thái thưởng được tính",
  top90Ratio: "tỉ lệ Top",
  studentAlert: "cảnh báo học sinh",
  actionSlaDays: "SLA hành động",
};

/** Vietnamese field name ("deadline" → "Hạn xử lý"); unknown keys are returned as is. */
export function fieldLabel(key: string, capitalize = true): string {
  const l = FIELD_LABELS[key];
  if (!l) return key;
  return capitalize ? l.charAt(0).toLocaleUpperCase("vi") + l.slice(1) : l;
}

function isRecord(v: unknown): v is Detail {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function numOf(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Count of an array or a number ("added: ['L01']" and "added: 1" both → 1). */
function countOf(v: unknown): number | undefined {
  if (Array.isArray(v)) return v.length;
  return numOf(v);
}

/** Sum of a { section: n } object (workbook import counts). */
function sumOf(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (!isRecord(v)) return undefined;
  let s = 0;
  for (const x of Object.values(v)) if (typeof x === "number") s += x;
  return s;
}

const VALUE_LABELS: Record<string, string> = {
  ...ACTION_STATUS_LABELS,
  ...PRIORITY_LABELS,
  ...ROLE_LABELS,
  ...STUDENT_STATUS_LABELS,
};

/** Human value for tables: "–" for empty, dd/mm/yyyy for dates, vi-VN numbers, Vietnamese enum labels, compact JSON. */
export function formatAuditValue(v: unknown): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "string") {
    if (v === "") return "(trống)";
    if (isIsoDate(v)) return formatDateVN(v);
    return VALUE_LABELS[v] ?? v;
  }
  if (typeof v === "number") return formatNumberVN(v);
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (Array.isArray(v)) {
    if (v.length === 0) return "(trống)";
    if (v.every((x) => typeof x === "string" || typeof x === "number")) return v.map((x) => formatAuditValue(x)).join(", ");
    return v.map((x) => (isRecord(x) ? recordText(x) : formatAuditValue(x))).join("; ");
  }
  if (isRecord(v)) return recordText(v);
  return String(v);
}

/** Student refs / class refs read better as their name or code; other objects as "k: v" pairs. */
function recordText(o: Detail): string {
  const name = str(o.name) ?? str(o.classCode) ?? str(o.code);
  if (name) return o.classCode && o.name ? `${name} (${String(o.classCode)})` : name;
  return Object.entries(o)
    .map(([k, x]) => `${k}: ${typeof x === "object" && x !== null ? JSON.stringify(x) : String(x)}`)
    .join(", ");
}

export interface DiffRow {
  field: string;
  label: string;
  before: string;
  after: string;
}

/**
 * Before/after rows of an UPDATE_* detail: `{ changes: { field: { before, after } } }` (server auditDiff) or
 * `{ before: {...}, after: {...} }` (changed keys only). undefined when the detail carries no diff.
 */
export function diffRowsOf(detail: Detail | undefined): DiffRow[] | undefined {
  if (!detail) return undefined;
  const rows: DiffRow[] = [];
  if (isRecord(detail.changes)) {
    for (const [field, change] of Object.entries(detail.changes)) {
      if (isRecord(change) && ("before" in change || "after" in change)) {
        rows.push({ field, label: fieldLabel(field), before: formatAuditValue(change.before), after: formatAuditValue(change.after) });
      }
    }
    return rows.length ? rows : undefined;
  }
  if (isRecord(detail.before) && isRecord(detail.after)) {
    const b = detail.before;
    const a = detail.after;
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    for (const field of keys) {
      if (JSON.stringify(b[field] ?? null) === JSON.stringify(a[field] ?? null)) continue;
      rows.push({ field, label: fieldLabel(field), before: formatAuditValue(b[field]), after: formatAuditValue(a[field]) });
    }
    return rows.length ? rows : undefined;
  }
  return undefined;
}

function join(parts: Array<string | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" · ");
}

function pointsText(v: unknown, sign = ""): string | undefined {
  const n = numOf(v);
  return n === undefined ? undefined : `${sign}${formatNumberVN(n)} điểm`;
}

function changesText(d: Detail): string | undefined {
  const rows = diffRowsOf(d);
  if (!rows) return undefined;
  if (rows.length === 1) {
    const r = rows[0];
    const short = r.before.length + r.after.length <= 60;
    return short ? `${r.label}: ${r.before} → ${r.after}` : `Đổi ${fieldLabel(r.field, false)}`;
  }
  const status = rows.find((r) => r.field === "status");
  const names = rows.map((r) => fieldLabel(r.field, false));
  return status ? `${status.label}: ${status.before} → ${status.after} (+${rows.length - 1} mục)` : `Đổi ${names.join(", ")}`;
}

/** "21/10/2026 · 3 lớp · Nề nếp lớp học" | "… · Kiểm tra chung" (inspection rounds). */
function inspectionText(d: Detail): string | undefined {
  const date = str(d.date);
  const classes = Array.isArray(d.classCodes) ? d.classCodes.length : undefined;
  if (!date && classes === undefined) return undefined;
  return join([
    date && isIsoDate(date) ? formatDateVN(date) : date,
    classes !== undefined ? `${formatNumberVN(classes)} lớp` : undefined,
    str(d.category) ?? "Kiểm tra chung",
  ]);
}

function genericText(d: Detail): string {
  return Object.entries(d)
    .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    .slice(0, 3)
    .map(([k, v]) => `${fieldLabel(k)}: ${formatAuditValue(v)}`)
    .join(" · ");
}

function clip(s: string, max = SUMMARY_MAX): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** One-line summary for the table, e.g. "6A01 · L04 · 6 điểm". */
export function summarizeAudit(log: Pick<AuditLog, "action" | "detail" | "ip">): string {
  const d: Detail = isRecord(log.detail) ? log.detail : {};
  const ip = log.ip ? `IP ${log.ip}` : undefined;
  switch (log.action) {
    case "LOGIN":
    case "LOGOUT":
      return clip(join([ip]));
    case "LOGIN_FAILED":
      return clip(join([str(d.reason) && `Lý do: ${str(d.reason)}`, ip]));
    case "CREATE_INCIDENT":
    case "RESTORE_INCIDENT":
      return clip(join([str(d.classCode), str(d.errorCode), pointsText(d.points)]));
    case "DELETE_INCIDENT":
      return clip(join([str(d.classCode), str(d.errorCode), pointsText(d.points), str(d.reason) && `Lý do: ${str(d.reason)}`]));
    case "CREATE_REWARD":
    case "RESTORE_REWARD":
      return clip(join([str(d.classCode), pointsText(d.points, "+"), d.proposed === true ? "GVCN đề xuất" : undefined, str(d.reason)]));
    case "DELETE_REWARD":
      return clip(join([str(d.classCode), pointsText(d.points, "+"), str(d.reason) && `Lý do xóa: ${str(d.reason)}`]));
    case "GVCN_FEEDBACK":
      return clip(join([str(d.classCode), str(d.code), changesText(d)]));
    case "CREATE_INSPECTION":
      return clip(join([str(d.code), inspectionText(d)]));
    case "UPDATE_INSPECTION":
      return clip(join([str(d.code), changesText(d)]) || genericText(d));
    case "DELETE_INSPECTION":
      return clip(join([str(d.code), inspectionText(d), str(d.reason) && `Lý do: ${str(d.reason)}`]));
    case "ADD_STUDENT":
      return clip(join([str(d.name), str(d.classCode)]));
    case "TRANSFER_STUDENT":
      return clip(
        join([
          str(d.name),
          d.promoteLevel === true ? "Chuyển cấp" : undefined,
          str(d.from) && str(d.to)
            ? d.promoteLevel === true && str(d.fromLevel) && str(d.toLevel)
              ? `${str(d.fromLevel)} ${str(d.from)} → ${str(d.toLevel)} ${str(d.to)}`
              : `${str(d.from)} → ${str(d.to)}`
            : undefined,
        ]),
      );
    case "WITHDRAW_STUDENT": {
      const status = str(d.status);
      return clip(join([str(d.name), str(d.classCode), status ? formatAuditValue(status) : undefined]));
    }
    case "REINSTATE_STUDENT":
      return clip(join([str(d.name), str(d.to) && `Vào lớp ${str(d.to)}`]));
    case "IMPORT_STUDENTS":
      return clip(join([numOf(d.rows) !== undefined ? `${formatNumberVN(numOf(d.rows) ?? 0)} dòng` : undefined, str(d.mode) === "sync" ? "Đồng bộ" : undefined]));
    case "IMPORT_EXCEL": {
      const created = sumOf(d.created);
      const updated = sumOf(d.updated);
      return clip(
        join([
          str(d.sourceFileName),
          created !== undefined ? `${formatNumberVN(created)} mới` : undefined,
          updated !== undefined ? `${formatNumberVN(updated)} cập nhật` : undefined,
        ]),
      );
    }
    case "EXPORT_EXCEL": {
      const kind = str(d.kind);
      const rows = numOf(d.rows);
      return clip(join([kind ? (EXPORT_KIND_LABELS[kind] ?? kind) : undefined, rows !== undefined ? `${formatNumberVN(rows)} dòng` : undefined]));
    }
    case "RESET_DATA":
      if (d.purgeEvidence === true) {
        const bytes = numOf(d.deletedBytes);
        return clip(
          join([
            "Dọn ảnh minh chứng không dùng",
            `${formatNumberVN(numOf(d.deleted) ?? 0)} ảnh đã xóa`,
            bytes !== undefined ? `${formatNumberVN(Math.round(bytes / 1024))} KB` : undefined,
            numOf(d.relinked) ? `${formatNumberVN(numOf(d.relinked) ?? 0)} ảnh gắn lại bản ghi` : undefined,
          ]),
        );
      }
      return clip(
        join([
          d.restore === true ? "Khôi phục lô đặt lại" : "Đặt lại cấp học",
          numOf(d.incidents) !== undefined ? `${formatNumberVN(numOf(d.incidents) ?? 0)} sự việc` : undefined,
          numOf(d.rewards) !== undefined ? `${formatNumberVN(numOf(d.rewards) ?? 0)} điểm thưởng` : undefined,
        ]),
      );
    case "UPDATE_CATALOG":
    case "UPDATE_CLASSES": {
      const parts = (
        [
          ["thêm", countOf(d.added)],
          ["sửa", countOf(d.updated)],
          ["ngừng dùng", countOf(d.deactivated)],
        ] as const
      )
        .filter(([, n]) => n)
        .map(([w, n]) => `${w} ${formatNumberVN(n ?? 0)}`);
      return clip(parts.length ? parts.join(", ").replace(/^./, (c) => c.toLocaleUpperCase("vi")) : genericText(d));
    }
    case "UPDATE_WEEKS":
      return clip(join([d.regenerated === true ? "Tạo lại lịch tuần" : undefined, numOf(d.count) !== undefined ? `${formatNumberVN(numOf(d.count) ?? 0)} tuần` : undefined]));
    case "CREATE_USER":
    case "RESET_PASSWORD":
      return clip(join([str(d.email), str(d.role) ? formatAuditValue(str(d.role)) : undefined, d.bulkGvcn === true ? "Tạo hàng loạt" : undefined]));
    case "UPDATE_USER":
      return clip(join([str(d.email), changesText(d) ?? (d.bulkGvcn === true ? "Gán thêm lớp chủ nhiệm" : undefined)]));
    case "CREATE_ACTION":
      return clip(join([str(d.code), str(d.title)]));
    case "UPDATE_ACTION":
      return clip(join([str(d.code), changesText(d), str(d.note) && `“${str(d.note)}”`]));
    case "UPLOAD_EVIDENCE": {
      const size = numOf(d.size);
      return clip(join([str(d.fileName) ?? str(d.mime), size !== undefined ? `${formatNumberVN(Math.round(size / 1024))} KB` : undefined]));
    }
    case "UPDATE_INCIDENT":
      if (Array.isArray(d.notDuplicate)) {
        const others = d.notDuplicate.filter((c): c is string => typeof c === "string" && c !== d.code);
        return clip(join([str(d.code), `Đánh dấu không trùng với ${others.join(", ") || "sự việc khác"}`]));
      }
      return clip(join([str(d.code), changesText(d)]) || genericText(d));
    case "UPDATE_REWARD":
    case "UPDATE_STUDENT":
    case "UPDATE_CONFIG":
      return clip(join([str(d.code) ?? str(d.name), changesText(d)]) || genericText(d));
    default:
      return clip(changesText(d) ?? genericText(d));
  }
}
