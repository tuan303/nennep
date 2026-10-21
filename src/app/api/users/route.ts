import { UserCreateSchema, type ListResponse } from "@/lib/contract";
import type { UserProfile } from "@/lib/types";
import { createUser, listUsers } from "@/lib/server/admin/users";
import { apiHandler, created, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every user profile (by role, then name). */
export const GET = apiHandler({ permission: "users.manage" }, async (): Promise<ListResponse<UserProfile>> => ({ items: await listUsers() }));

/** Create (or link an existing Auth user) → 201 { profile, tempPassword? } – the password is shown once. */
export const POST = apiHandler({ permission: "users.manage" }, async ({ req, user, ip }) => {
  const input = await parseBody(req, UserCreateSchema);
  return created(await createUser({ user, ip }, input));
});
