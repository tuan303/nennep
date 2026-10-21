import { ClassesPutSchema, type ListResponse } from "@/lib/contract";
import type { ClassInfo } from "@/lib/types";
import { levelFromParam } from "@/lib/server/admin/common";
import { putClasses } from "@/lib/server/admin/settings";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replace the class list (GVCN, email…); classes missing from the list become inactive (never deleted). */
export const PUT = apiHandler<{ level: string }>({ permission: "settings.manage" }, async ({ req, user, ip, params }): Promise<ListResponse<ClassInfo>> => {
  const levelId = levelFromParam(params.level);
  const input = await parseBody(req, ClassesPutSchema);
  return { items: await putClasses({ user, ip }, levelId, input) };
});
