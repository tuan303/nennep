import { InspectionCreateSchema } from "@/lib/contract";
import { apiHandler, created, parseBody, withStatus } from "@/lib/server/handler";
import { createInspection } from "@/lib/server/inspections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Record an inspection round (Đợt kiểm tra) → 201 (200 with the existing round for a repeated clientRequestId). */
export const POST = apiHandler({ permission: "inspection.manage" }, async ({ req, user, ip }) => {
  const input = await parseBody(req, InspectionCreateSchema);
  const { inspection, created: isNew } = await createInspection({ user, ip }, input);
  return isNew ? created(inspection) : withStatus(200, inspection);
});
