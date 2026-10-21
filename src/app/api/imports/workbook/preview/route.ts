import { WorkbookPreviewSchema, type WorkbookPreview } from "@/lib/contract";
import { previewWorkbook } from "@/lib/server/admin/imports-workbook";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Validate a parsed NSHM workbook section by section (OK / WARNING / ERROR per row). No writes. */
export const POST = apiHandler({ permission: "excel.import" }, async ({ req, user, ip }): Promise<WorkbookPreview> => {
  const input = await parseBody(req, WorkbookPreviewSchema);
  return previewWorkbook({ user, ip }, input);
});
