import { NotDuplicateSchema, type ListResponse } from "@/lib/contract";
import type { Incident } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { markNotDuplicate } from "@/lib/server/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Không trùng": mark every pair of {id} ∪ otherIds (same level) as reviewed – not duplicates of each other. */
export const POST = apiHandler<{ id: string }>({ permission: "data.inspect" }, async ({ req, user, ip, params }): Promise<ListResponse<Incident>> => {
  const input = await parseBody(req, NotDuplicateSchema);
  return { items: await markNotDuplicate({ user, ip }, params.id, input) };
});
