import { DeleteSchema, IncidentUpdateSchema, type OkResponse } from "@/lib/contract";
import type { Incident } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { getIncidentForViewer, softDeleteIncident, updateIncident } from "@/lib/server/incidents";
import { noticeHooks } from "@/lib/server/mail/notice-drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Room for the GVCN notice drain scheduled after the response (notice-drain.ts). */
export const maxDuration = 60;

type Params = { id: string };

/** One incident (needs student-level detail access to its class). */
export const GET = apiHandler<Params>({ permission: "view.dashboard" }, async ({ user, params }): Promise<Incident> =>
  getIncidentForViewer(user, params.id),
);

/** Edit: ADMIN any record; EDITOR own records within 24 h. */
export const PATCH = apiHandler<Params>(
  { anyPermission: ["record.editAny", "record.editOwnRecent"] },
  async ({ req, user, ip, params }): Promise<Incident> => {
    const hooks = noticeHooks(req);
    const patch = await parseBody(req, IncidentUpdateSchema);
    return updateIncident({ user, ip, ...hooks }, params.id, patch);
  },
);

/** Soft delete with a reason (JSON body `{ reason }`). */
export const DELETE = apiHandler<Params>({ permission: "record.delete" }, async ({ req, user, ip, params }): Promise<OkResponse> => {
  const hooks = noticeHooks(req);
  const { reason } = await parseBody(req, DeleteSchema);
  await softDeleteIncident({ user, ip, ...hooks }, params.id, reason);
  return { ok: true };
});
