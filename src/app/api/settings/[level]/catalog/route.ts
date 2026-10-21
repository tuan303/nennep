import { CatalogPutSchema, type ListResponse } from "@/lib/contract";
import type { CatalogItem } from "@/lib/types";
import { levelFromParam } from "@/lib/server/admin/common";
import { putCatalog } from "@/lib/server/admin/settings";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replace the error catalog; codes missing from the list become inactive (never deleted). */
export const PUT = apiHandler<{ level: string }>({ permission: "settings.manage" }, async ({ req, user, ip, params }): Promise<ListResponse<CatalogItem>> => {
  const levelId = levelFromParam(params.level);
  const input = await parseBody(req, CatalogPutSchema);
  return { items: await putCatalog({ user, ip }, levelId, input) };
});
