/**
 * Filter model of the audit log screen (/nhat-ky): form → GET /api/audit-logs query, date presets, local
 * partial-email filtering, stat counters and the Excel export rows. Pure (no React / fetch).
 */
import type { AuditLogQuery } from "@/lib/client/api";
import { LEVELS } from "@/lib/constants";
import { addDays, formatDateVN, isIsoDate, mondayOf, normalizeVN } from "@/lib/engine";
import type { AuditAction, AuditLog, LevelId } from "@/lib/types";
import { auditActionLabel, entityLabel, roleLabel } from "./audit-labels";
import { summarizeAudit } from "./audit-summary";

/** Items per request (server max 100). A page may still hold fewer items while more exist (scan limit). */
export const AUDIT_PAGE_SIZE = 50;
/** Stats queries ask for this many rows; more → "100+". */
export const STATS_LIMIT = 100;
/** Failed sign-ins today above this number are highlighted. */
export const FAILED_LOGIN_WARN = 5;

export interface AuditFilterForm {
  action?: AuditAction;
  email: string;
  level?: LevelId;
  from: string; // yyyy-mm-dd | ""
  to: string; // yyyy-mm-dd | ""
}

export const EMPTY_AUDIT_FORM: AuditFilterForm = { email: "", from: "", to: "" };

export interface AppliedAuditFilter {
  /** Server query (without cursor / limit). */
  query: Omit<AuditLogQuery, "cursor" | "limit">;
  /** Partial email (no "@") – matched on the loaded rows only, the server needs the exact address. */
  localEmail?: string;
}

export function buildAuditFilter(form: AuditFilterForm): { filter: AppliedAuditFilter } | { error: string } {
  const from = form.from.trim();
  const to = form.to.trim();
  if (from && !isIsoDate(from)) return { error: "Ngày bắt đầu không hợp lệ." };
  if (to && !isIsoDate(to)) return { error: "Ngày kết thúc không hợp lệ." };
  if (from && to && from > to) return { error: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." };
  const query: AppliedAuditFilter["query"] = {};
  if (form.action) query.action = form.action;
  if (form.level) query.level = form.level;
  if (from) query.from = from;
  if (to) query.to = to;
  const email = form.email.trim().toLowerCase();
  const filter: AppliedAuditFilter = { query };
  if (email.includes("@")) query.email = email;
  else if (email) filter.localEmail = email;
  return { filter };
}

export function filterKey(f: AppliedAuditFilter): string {
  return JSON.stringify([f.query.action ?? "", f.query.email ?? "", f.query.level ?? "", f.query.from ?? "", f.query.to ?? "", f.localEmail ?? ""]);
}

export function activeAuditFilterCount(form: AuditFilterForm): number {
  return [form.action, form.email.trim(), form.level, form.from, form.to].filter(Boolean).length;
}

export function applyLocalFilter(items: readonly AuditLog[], filter: AppliedAuditFilter): AuditLog[] {
  const q = filter.localEmail ? normalizeVN(filter.localEmail) : "";
  if (!q) return [...items];
  return items.filter((l) => normalizeVN(l.email).includes(q));
}

export type DatePreset = "today" | "7d" | "30d" | "week";

export const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
];

export function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: mondayOf(today), to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
  }
}

export function presetOf(form: Pick<AuditFilterForm, "from" | "to">, today: string): DatePreset | undefined {
  return DATE_PRESETS.find((p) => {
    const r = presetRange(p.value, today);
    return r.from === form.from && r.to === form.to;
  })?.value;
}

/** "12", or "100+" when the server reported more rows. */
export function countText(count: number, more: boolean): string {
  return more ? `${count}+` : String(count);
}

export function distinctEmails(items: readonly AuditLog[]): number {
  return new Set(items.map((l) => l.email).filter(Boolean)).size;
}

/* --------------------------------- export --------------------------------- */

export const AUDIT_EXPORT_COLUMNS = [
  { header: "Thời gian", key: "time", width: 18 },
  { header: "Email", key: "email", width: 30 },
  { header: "Vai trò", key: "role", width: 16 },
  { header: "Hành động", key: "action", width: 26 },
  { header: "Mã hành động", key: "code", width: 20 },
  { header: "Đối tượng", key: "entity", width: 18 },
  { header: "Mã đối tượng", key: "entityId", width: 28 },
  { header: "Cấp học", key: "level", width: 10 },
  { header: "Tóm tắt", key: "summary", width: 48 },
  { header: "IP", key: "ip", width: 16 },
  { header: "Chi tiết (JSON)", key: "detail", width: 60 },
];

/** Excel cells hold at most 32 767 characters. */
const CELL_MAX = 32_000;

export function auditExportRows(items: readonly AuditLog[], fmtTime: (iso: string) => string): Array<Record<string, string | number | null>> {
  return items.map((l) => {
    const detail = l.detail ? JSON.stringify(l.detail) : "";
    return {
      time: fmtTime(l.ts),
      email: l.email || null,
      role: roleLabel(l.role),
      action: auditActionLabel(l.action),
      code: l.action,
      entity: entityLabel(l.entity) || null,
      entityId: l.entityId ?? null,
      level: l.levelId ? LEVELS[l.levelId].short : null,
      summary: summarizeAudit(l) || null,
      ip: l.ip ?? null,
      detail: detail ? detail.slice(0, CELL_MAX) : null,
    };
  });
}

export function auditFilterText(f: AppliedAuditFilter): string {
  const parts: string[] = [];
  if (f.query.action) parts.push(`Hành động: ${auditActionLabel(f.query.action)}`);
  if (f.query.email) parts.push(`Email: ${f.query.email}`);
  if (f.localEmail) parts.push(`Email chứa: ${f.localEmail}`);
  if (f.query.level) parts.push(`Cấp học: ${LEVELS[f.query.level].short}`);
  if (f.query.from || f.query.to) parts.push(`Từ ${f.query.from ? formatDateVN(f.query.from) : "…"} đến ${f.query.to ? formatDateVN(f.query.to) : "…"}`);
  return parts.length ? parts.join(" · ") : "Tất cả bản ghi";
}
