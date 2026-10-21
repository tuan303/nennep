import { GvcnFeedbackSchema } from "@/lib/contract";
import type { Incident } from "@/lib/types";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { gvcnFeedback } from "@/lib/server/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GVCN feedback on an incident of their own class (note, status, remediation); ADMIN may answer any class of its
 * levels; `incident.remediate` (EDITOR) may set the remediation and the status, never the GVCN note.
 */
export const POST = apiHandler<{ id: string }>({ anyPermission: ["incident.gvcnFeedback", "incident.remediate"] }, async ({ req, user, ip, params }): Promise<Incident> => {
  const input = await parseBody(req, GvcnFeedbackSchema);
  return gvcnFeedback({ user, ip }, params.id, input);
});
