/** POST /api/exports/log — audit EXPORT_EXCEL for files generated in the browser (workbook, HTML, ranking…). */
import type { z } from "zod";
import type { ExportLogSchema } from "../../contract";
import { auditOf, writeAuditDirect } from "../audit";
import { requireLevel } from "../auth";
import type { ServiceCtx } from "../records";

export type ExportLogData = z.output<typeof ExportLogSchema>;

/** Larger client-supplied details are not stored (audit docs stay small). */
export const MAX_EXPORT_DETAIL_CHARS = 4000;

export async function logExport(ctx: ServiceCtx, input: ExportLogData): Promise<void> {
  if (input.levelId) requireLevel(ctx.user, input.levelId);
  const raw = input.detail ?? {};
  const detail = JSON.stringify(raw).length > MAX_EXPORT_DETAIL_CHARS ? { kind: input.kind, truncated: true } : { ...raw, kind: input.kind };
  await writeAuditDirect(auditOf(ctx.user, "EXPORT_EXCEL", { entity: "export", entityId: input.kind, levelId: input.levelId, ip: ctx.ip, detail }));
}
