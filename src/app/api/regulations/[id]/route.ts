import { RegulationPutSchema } from "@/lib/contract";
import type { Regulation } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { regulationIdFromParam, saveRegulation } from "@/lib/server/regulations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save title + school year + body (the first save creates the regulation); stale `baseRev` → 409. */
export const PUT = apiHandler<{ id: string }>({ permission: "regulations.manage" }, async ({ req, user, ip, params }): Promise<Regulation> => {
  const id = regulationIdFromParam(params.id);
  const input = await parseBody(req, RegulationPutSchema);
  return saveRegulation({ user, ip }, id, input);
});
