import type { AuditLogPage } from "@/lib/contract";
import { AuditQuerySchema, queryAuditLogs } from "@/lib/server/admin/audit-query";
import { apiHandler, parseQuery } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?action&email&level&from&to (yyyy-mm-dd, VN days)&cursor&limit(≤100) → newest first + nextCursor. */
export const GET = apiHandler({ permission: "audit.view" }, async ({ req }): Promise<AuditLogPage> => queryAuditLogs(parseQuery(req, AuditQuerySchema)));
