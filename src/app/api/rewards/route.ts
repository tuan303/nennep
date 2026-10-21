import { RewardCreateSchema, type ListResponse } from "@/lib/contract";
import type { Reward } from "@/lib/types";
import { requireLevel } from "@/lib/server/auth";
import { Errors } from "@/lib/server/errors";
import { apiHandler, created, flagParam, levelParam, parseBody, withStatus } from "@/lib/server/handler";
import { createReward, listDeletedRewards } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a reward → 201 (200 with the existing record for a repeated clientRequestId). */
export const POST = apiHandler({ permission: "reward.create" }, async ({ req, user, ip }) => {
  const input = await parseBody(req, RewardCreateSchema);
  const { reward, created: isNew } = await createReward({ user, ip }, input);
  return isNew ? created(reward) : withStatus(200, reward);
});

/** Soft-deleted rewards of a level (?level=THCS&deleted=1). */
export const GET = apiHandler({ permission: "record.delete" }, async ({ req, user }): Promise<ListResponse<Reward>> => {
  const levelId = levelParam(req);
  requireLevel(user, levelId);
  if (!flagParam(req, "deleted")) {
    throw Errors.validation("Chỉ hỗ trợ xem danh sách đã xóa (deleted=1). Dữ liệu đang dùng được lấy qua /api/dataset.");
  }
  return { items: await listDeletedRewards(levelId) };
});
