import { StudentImportCommitSchema, type StudentImportResult } from "@/lib/contract";
import { commitStudentImport } from "@/lib/server/admin/imports-students";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Apply a previewed roster import; 409 when the data changed since the preview (previewHash differs). */
export const POST = apiHandler({ permission: "students.manage" }, async ({ req, user, ip }): Promise<StudentImportResult> => {
  const input = await parseBody(req, StudentImportCommitSchema);
  return commitStudentImport({ user, ip }, input);
});
