import { StudentWithdrawSchema } from "@/lib/contract";
import type { Student } from "@/lib/types";
import { withdrawStudent } from "@/lib/server/admin/students";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chuyển trường đi / tốt nghiệp / ngừng theo dõi (status, leftAt, leftReason + history TRANSFER_OUT). */
export const POST = apiHandler<{ id: string }>({ permission: "students.manage" }, async ({ req, user, ip, params }): Promise<Student> => {
  const input = await parseBody(req, StudentWithdrawSchema);
  return withdrawStudent({ user, ip }, params.id, input);
});
