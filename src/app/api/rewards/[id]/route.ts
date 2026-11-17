import { DeleteSchema, RewardUpdateSchema, type OkResponse } from "@/lib/contract";
import type { Reward } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { noticeHooks } from "@/lib/server/mail/notice-drain";
import { softDeleteReward, updateReward } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Room for the GVCN notice drain scheduled after the response (notice-drain.ts). */
export const maxDuration = 60;

type Params = { id: string };

/** Edit: ADMIN any; EDITOR own within 24 h; "Đã xác nhận" needs reward.verify. */
export const PATCH = apiHandler<Params>(
  { anyPermission: ["record.editAny", "record.editOwnRecent"] },
  async ({ req, user, ip, params }): Promise<Reward> => {
    const hooks = noticeHooks(req);
    const patch = await parseBody(req, RewardUpdateSchema);
    return updateReward({ user, ip, ...hooks }, params.id, patch);
  },
);

/** Soft delete with a reason. */
export const DELETE = apiHandler<Params>({ permission: "record.delete" }, async ({ req, user, ip, params }): Promise<OkResponse> => {
  const hooks = noticeHooks(req);
  const { reason } = await parseBody(req, DeleteSchema);
  await softDeleteReward({ user, ip, ...hooks }, params.id, reason);
  return { ok: true };
});
