import { StudentReinstateSchema } from "@/lib/contract";
import type { Student } from "@/lib/types";
import { reinstateStudent } from "@/lib/server/admin/students";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A withdrawn student becomes ACTIVE again in an active class (history REINSTATE). */
export const POST = apiHandler<{ id: string }>({ permission: "students.manage" }, async ({ req, user, ip, params }): Promise<Student> => {
  const input = await parseBody(req, StudentReinstateSchema);
  return reinstateStudent({ user, ip }, params.id, input);
});
