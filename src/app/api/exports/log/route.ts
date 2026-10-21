import { ExportLogSchema, type OkResponse } from "@/lib/contract";
import { logExport } from "@/lib/server/admin/exports";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Audit an export generated in the browser (EXPORT_EXCEL). */
export const POST = apiHandler({ permission: "excel.export" }, async ({ req, user, ip }): Promise<OkResponse> => {
  const input = await parseBody(req, ExportLogSchema);
  await logExport({ user, ip }, input);
  return { ok: true };
});
