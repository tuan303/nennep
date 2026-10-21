import { DeleteSchema, RewardUpdateSchema, type OkResponse } from "@/lib/contract";
import type { Reward } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { softDeleteReward, updateReward } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** Edit: ADMIN any; EDITOR own within 24 h; "Đã xác nhận" needs reward.verify. */
export const PATCH = apiHandler<Params>(
  { anyPermission: ["record.editAny", "record.editOwnRecent"] },
  async ({ req, user, ip, params }): Promise<Reward> => {
    const patch = await parseBody(req, RewardUpdateSchema);
    return updateReward({ user, ip }, params.id, patch);
  },
);

/** Soft delete with a reason. */
export const DELETE = apiHandler<Params>({ permission: "record.delete" }, async ({ req, user, ip, params }): Promise<OkResponse> => {
  const { reason } = await parseBody(req, DeleteSchema);
  await softDeleteReward({ user, ip }, params.id, reason);
  return { ok: true };
});
