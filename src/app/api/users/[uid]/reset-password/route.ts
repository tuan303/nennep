import { resetPassword } from "@/lib/server/admin/users";
import { apiHandler } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** New temporary password, returned once (audit RESET_PASSWORD; the password itself is never logged). */
export const POST = apiHandler<{ uid: string }>({ permission: "users.manage" }, async ({ user, ip, params }): Promise<{ tempPassword: string }> =>
  resetPassword({ user, ip }, params.uid),
);
