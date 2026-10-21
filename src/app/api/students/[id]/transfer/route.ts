import { StudentTransferSchema } from "@/lib/contract";
import type { Student } from "@/lib/types";
import { transferStudent } from "@/lib/server/admin/students";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Move an ACTIVE student to another active class of the same level (old incidents keep their snapshot). */
export const POST = apiHandler<{ id: string }>({ permission: "students.manage" }, async ({ req, user, ip, params }): Promise<Student> => {
  const input = await parseBody(req, StudentTransferSchema);
  return transferStudent({ user, ip }, params.id, input);
});
