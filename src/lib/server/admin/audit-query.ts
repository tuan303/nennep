/**
 * GET /api/audit-logs: newest first, cursor pagination (limit ≤ 100).
 * Firestore runs ONE equality filter (email > action > level, most selective first) + the `ts` range/order
 * (indexes: auditLogs {field ASC, ts DESC}); the remaining filters are applied in memory, scanning at most
 * MAX_SCAN documents per call (the cursor then continues the scan).
 */
import { FieldPath, type Query } from "firebase-admin/firestore";
import { z } from "zod";
import { zIsoDate, zLevelId, type AuditLogPage } from "../../contract";
import { addDays } from "../../engine/dates";
import { COL } from "../../firestore-paths";
import type { AuditLog } from "../../types";
import { Errors } from "../errors";
import { db } from "../firebase-admin";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const AuditQuerySchema = z.object({
  action: z.preprocess(emptyToUndefined, z.string().trim().regex(/^[A-Z_]{2,40}$/, "Loại thao tác không hợp lệ").optional()),
  email: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().max(200).optional()),
  level: z.preprocess(emptyToUndefined, zLevelId.optional()),
  from: z.preprocess(emptyToUndefined, zIsoDate.optional()),
  to: z.preprocess(emptyToUndefined, zIsoDate.optional()),
  cursor: z.preprocess(emptyToUndefined, z.string().max(300).optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
});
export type AuditQuery = z.output<typeof AuditQuerySchema>;

export const MAX_SCAN = 3000;
const PAGE = 300;

interface Cursor {
  ts: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.ts, c.id]), "utf8").toString("base64url");
}

export function decodeCursor(s: string): Cursor {
  try {
    const v: unknown = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string") return { ts: v[0], id: v[1] };
  } catch {
    // fall through
  }
  throw Errors.validation("Con trỏ phân trang không hợp lệ. Vui lòng tải lại trang.");
}

/** Start of a VN calendar day as an ISO UTC timestamp (2026-10-21 → 2026-10-20T17:00:00.000Z). */
export function vnDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00+07:00`).toISOString();
}

export async function queryAuditLogs(q: AuditQuery): Promise<AuditLogPage> {
  if (q.from && q.to && q.from > q.to) throw Errors.validation("Ngày bắt đầu phải trước ngày kết thúc.");
  let base: Query = db().collection(COL.auditLogs);
  const eq: ["email" | "action" | "levelId", string] | undefined = q.email ? ["email", q.email] : q.action ? ["action", q.action] : q.level ? ["levelId", q.level] : undefined;
  if (eq) base = base.where(eq[0], "==", eq[1]);
  if (q.from) base = base.where("ts", ">=", vnDayStartIso(q.from));
  if (q.to) base = base.where("ts", "<", vnDayStartIso(addDays(q.to, 1)));
  base = base.orderBy("ts", "desc").orderBy(FieldPath.documentId(), "desc");

  const matches = (log: AuditLog) =>
    (!q.email || log.email === q.email) && (!q.action || log.action === q.action) && (!q.level || log.levelId === q.level);

  const items: AuditLog[] = [];
  let after = q.cursor ? decodeCursor(q.cursor) : undefined;
  let scanned = 0;
  let exhausted = false;
  while (items.length <= q.limit && scanned < MAX_SCAN) {
    const page = after ? base.startAfter(after.ts, after.id) : base;
    const snap = await page.limit(PAGE).get();
    for (const d of snap.docs) {
      const log = d.data() as AuditLog;
      scanned++;
      after = { ts: log.ts, id: d.id };
      if (matches(log)) items.push({ ...log, id: d.id });
      if (items.length > q.limit) break;
    }
    if (snap.size < PAGE) {
      exhausted = items.length <= q.limit;
      break;
    }
  }
  if (items.length > q.limit) {
    const last = items[q.limit - 1];
    return { items: items.slice(0, q.limit), nextCursor: encodeCursor({ ts: last.ts, id: last.id }) };
  }
  if (!exhausted && after) return { items, nextCursor: encodeCursor(after) };
  return { items };
}
