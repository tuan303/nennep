import type { Reward } from "@/lib/types";
import { apiHandler } from "@/lib/server/handler";
import { restoreReward } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Restore a soft-deleted reward (Admin). */
export const POST = apiHandler<{ id: string }>({ permission: "record.delete" }, async ({ user, ip, params }): Promise<Reward> =>
  restoreReward({ user, ip }, params.id),
);
