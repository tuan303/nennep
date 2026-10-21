import { WeeksPutSchema, type ListResponse } from "@/lib/contract";
import type { SchoolWeek } from "@/lib/types";
import { levelFromParam } from "@/lib/server/admin/common";
import { putWeeks } from "@/lib/server/admin/settings";
import { apiHandler, flagParam, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replace the school-week calendar, or `{ regenerate: true }` from the config (counted flags are kept). */
export const PUT = apiHandler<{ level: string }>({ permission: "settings.manage" }, async ({ req, user, ip, params }): Promise<ListResponse<SchoolWeek>> => {
  const levelId = levelFromParam(params.level);
  const input = await parseBody(req, WeeksPutSchema);
  // ?allowHidingRecords=1: the admin confirmed that records of removed weeks may disappear from statistics.
  return { items: await putWeeks({ user, ip }, levelId, input, { allowHidingRecords: flagParam(req, "allowHidingRecords") }) };
});
