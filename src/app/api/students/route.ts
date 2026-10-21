import { StudentCreateSchema } from "@/lib/contract";
import type { Student } from "@/lib/types";
import { createStudent } from "@/lib/server/admin/students";
import { apiHandler, created, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a student (tuyển mới / chuyển đến) → 201. Mã HS must be unique across the school (409). */
export const POST = apiHandler({ permission: "students.manage" }, async ({ req, user, ip }) => {
  const input = await parseBody(req, StudentCreateSchema);
  const student: Student = await createStudent({ user, ip }, input);
  return created(student);
});
