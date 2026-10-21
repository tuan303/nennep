import { ConfigUpdateSchema } from "@/lib/contract";
import type { LevelConfig } from "@/lib/types";
import { levelFromParam } from "@/lib/server/admin/common";
import { putConfig } from "@/lib/server/admin/settings";
import { apiHandler, flagParam, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Merge + validate the level config (RAG thresholds/approval, semesters, base score…); audit UPDATE_CONFIG. */
export const PUT = apiHandler<{ level: string }>({ permission: "settings.manage" }, async ({ req, user, ip, params }): Promise<LevelConfig> => {
  const levelId = levelFromParam(params.level);
  const input = await parseBody(req, ConfigUpdateSchema);
  // ?allowHidingRecords=1: confirmed that a calendar generated from the config may drop weeks holding records.
  return putConfig({ user, ip }, levelId, input, { allowHidingRecords: flagParam(req, "allowHidingRecords") });
});
