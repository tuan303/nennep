import { EvidenceMaintenanceSchema, type EvidenceMaintenanceResult } from "@/lib/contract";
import { maintainEvidence } from "@/lib/server/admin/evidence-maintenance";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Evidence photos of a level: statistics (`dryRun`, default) or deletion of photos never attached to a record. */
export const POST = apiHandler({ permission: "data.reset" }, async ({ req, user, ip }): Promise<EvidenceMaintenanceResult> => {
  const input = await parseBody(req, EvidenceMaintenanceSchema);
  return maintainEvidence({ user, ip }, input);
});
