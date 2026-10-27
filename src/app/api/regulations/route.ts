import type { ListResponse } from "@/lib/contract";
import type { Regulation } from "@/lib/types";
import { apiHandler } from "@/lib/server/handler";
import { listRegulations } from "@/lib/server/regulations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quy chế khen thưởng / kỷ luật (every signed-in user) in top-bar order; never-saved ones omitted, no file bytes. */
export const GET = apiHandler({ permission: "view.dashboard" }, async ({ user }): Promise<ListResponse<Regulation>> => {
  return { items: await listRegulations(user) };
});
