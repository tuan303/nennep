import { UserUpdateSchema } from "@/lib/contract";
import type { UserProfile } from "@/lib/types";
import { updateUser } from "@/lib/server/admin/users";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Role / levels / GVCN classes / active / display name. The last active admin is protected (400). */
export const PATCH = apiHandler<{ uid: string }>({ permission: "users.manage" }, async ({ req, user, ip, params }): Promise<UserProfile> => {
  const patch = await parseBody(req, UserUpdateSchema);
  return updateUser({ user, ip }, params.uid, patch);
});
