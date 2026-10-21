import { RestoreResetSchema } from "@/lib/contract";
import { restoreReset } from "@/lib/server/admin/maintenance";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Undo a reset batch (only the records it deleted). */
export const POST = apiHandler({ permission: "data.reset" }, async ({ req, user, ip }): Promise<{ incidents: number; rewards: number }> => {
  const input = await parseBody(req, RestoreResetSchema);
  return restoreReset({ user, ip }, input);
});
