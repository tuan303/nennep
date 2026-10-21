import { ResetLevelSchema } from "@/lib/contract";
import { resetLevel } from "@/lib/server/admin/maintenance";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Soft-delete every live incident/reward of a level (confirmText must be "XOA <LEVEL>"); restorable by batchId. */
export const POST = apiHandler({ permission: "data.reset" }, async ({ req, user, ip }): Promise<{ batchId: string; incidents: number; rewards: number }> => {
  const input = await parseBody(req, ResetLevelSchema);
  return resetLevel({ user, ip }, input);
});
