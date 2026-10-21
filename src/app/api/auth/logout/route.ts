import type { OkResponse } from "@/lib/contract";
import { apiHandler } from "@/lib/server/handler";
import { recordLogout } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Audit LOGOUT (the client signs out of Firebase afterwards). */
export const POST = apiHandler({}, async ({ user, ip }): Promise<OkResponse> => {
  await recordLogout(user, ip);
  return { ok: true };
});
