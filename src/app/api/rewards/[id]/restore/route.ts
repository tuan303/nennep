import type { Reward } from "@/lib/types";
import { apiHandler } from "@/lib/server/handler";
import { noticeHooks } from "@/lib/server/mail/notice-drain";
import { restoreReward } from "@/lib/server/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Room for the GVCN notice drain scheduled after the response (notice-drain.ts). */
export const maxDuration = 60;

/** Restore a soft-deleted reward (Admin). */
export const POST = apiHandler<{ id: string }>({ permission: "record.delete" }, async ({ req, user, ip, params }): Promise<Reward> =>
  restoreReward({ user, ip, ...noticeHooks(req) }, params.id),
);
