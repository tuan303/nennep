import { EarlyWarningPutSchema } from "@/lib/contract";
import type { LevelConfig } from "@/lib/types";
import { levelFromParam } from "@/lib/server/admin/common";
import { putEarlyWarning } from "@/lib/server/admin/settings";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Early-warning thresholds of a level (Cài đặt → Cảnh báo sớm); audit UPDATE_CONFIG. */
export const PUT = apiHandler<{ level: string }>({ permission: "settings.manage" }, async ({ req, user, ip, params }): Promise<LevelConfig> => {
  const levelId = levelFromParam(params.level);
  const input = await parseBody(req, EarlyWarningPutSchema);
  return putEarlyWarning({ user, ip }, levelId, input);
});
