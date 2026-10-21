import { StudentUpdateSchema } from "@/lib/contract";
import type { Student } from "@/lib/types";
import { getStudent, updateStudent } from "@/lib/server/admin/students";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** Full student record incl. history (needs student-level detail access to the current class). */
export const GET = apiHandler<Params>({ permission: "view.dashboard" }, async ({ user, params }): Promise<Student> =>
  getStudent(user, params.id),
);

/** Personal info only (name, dob, gender, note); class/status changes use transfer/withdraw/reinstate. */
export const PATCH = apiHandler<Params>({ permission: "students.manage" }, async ({ req, user, ip, params }): Promise<Student> => {
  const patch = await parseBody(req, StudentUpdateSchema);
  return updateStudent({ user, ip }, params.id, patch);
});
