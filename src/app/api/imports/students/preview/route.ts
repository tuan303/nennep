import { StudentImportSchema, type StudentImportPreview } from "@/lib/contract";
import { previewStudentImport } from "@/lib/server/admin/imports-students";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Classify roster rows (NEW / UPDATE / TRANSFER / REINSTATE / UNCHANGED / INVALID). No writes. */
export const POST = apiHandler({ permission: "students.manage" }, async ({ req, user, ip }): Promise<StudentImportPreview> => {
  const input = await parseBody(req, StudentImportSchema);
  return previewStudentImport({ user, ip }, input);
});
