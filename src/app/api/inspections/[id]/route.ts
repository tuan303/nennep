import { DeleteSchema, InspectionUpdateSchema, type OkResponse } from "@/lib/contract";
import type { Inspection } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { softDeleteInspection, updateInspection } from "@/lib/server/inspections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** Edit a round: ADMIN any; EDITOR own within 24 h (`baseRev` → 409 when stale). */
export const PATCH = apiHandler<Params>({ permission: "inspection.manage" }, async ({ req, user, ip, params }): Promise<Inspection> => {
  const patch = await parseBody(req, InspectionUpdateSchema);
  return updateInspection({ user, ip }, params.id, patch);
});

/** Soft delete with a reason (JSON body `{ reason }`): ADMIN any; EDITOR own within 24 h. */
export const DELETE = apiHandler<Params>({ permission: "inspection.manage" }, async ({ req, user, ip, params }): Promise<OkResponse> => {
  const { reason } = await parseBody(req, DeleteSchema);
  await softDeleteInspection({ user, ip }, params.id, reason);
  return { ok: true };
});
