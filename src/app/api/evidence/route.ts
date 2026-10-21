import { EvidenceUploadSchema } from "@/lib/contract";
import { saveEvidence } from "@/lib/server/evidence";
import { apiHandler, created, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload a compressed evidence photo (data URL, ≤ 700 KB decoded) → 201 { id }. */
export const POST = apiHandler({ anyPermission: ["incident.create", "reward.create", "reward.propose"] }, async ({ req, user, ip }) => {
  const input = await parseBody(req, EvidenceUploadSchema, { maxBytes: 1_100_000 });
  const id = await saveEvidence({ user, ip }, input);
  return created({ id });
});
