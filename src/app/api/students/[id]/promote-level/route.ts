import { StudentPromoteSchema } from "@/lib/contract";
import type { Student } from "@/lib/types";
import { promoteStudentLevel } from "@/lib/server/admin/students";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chuyển cấp: the student (same Mã HS, history kept) becomes ACTIVE in a class of another level (both levels needed). */
export const POST = apiHandler<{ id: string }>({ permission: "students.manage" }, async ({ req, user, ip, params }): Promise<Student> => {
  const input = await parseBody(req, StudentPromoteSchema);
  return promoteStudentLevel({ user, ip }, params.id, input);
});
