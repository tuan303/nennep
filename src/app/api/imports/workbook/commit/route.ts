import { WorkbookCommitSchema, type WorkbookCommitResult } from "@/lib/contract";
import { commitWorkbook } from "@/lib/server/admin/imports-workbook";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Commit a previewed workbook; 409 when the data changed since the preview (previewHash differs). */
export const POST = apiHandler({ permission: "excel.import" }, async ({ req, user, ip }): Promise<WorkbookCommitResult> => {
  const input = await parseBody(req, WorkbookCommitSchema);
  return commitWorkbook({ user, ip }, input);
});
