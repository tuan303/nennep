import { GvcnFeedbackSchema } from "@/lib/contract";
import type { Incident } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { gvcnFeedback } from "@/lib/server/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GVCN feedback (note and/or status) on an incident of their own class; Admin may also answer. */
export const POST = apiHandler<{ id: string }>({ permission: "incident.gvcnFeedback" }, async ({ req, user, ip, params }): Promise<Incident> => {
  const input = await parseBody(req, GvcnFeedbackSchema);
  return gvcnFeedback({ user, ip }, params.id, input);
});
