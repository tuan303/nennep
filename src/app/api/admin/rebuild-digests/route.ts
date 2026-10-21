import { RebuildSchema, type OkResponse } from "@/lib/contract";
import type { LevelId } from "@/lib/types";
import type { RebuildResult } from "@/lib/server/digests";
import { rebuildDigests } from "@/lib/server/admin/maintenance";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rebuild the read-model digests of one level (or every accessible level); audit REBUILD_DIGESTS. */
export const POST = apiHandler({ permission: "settings.manage" }, async ({ req, user, ip }): Promise<OkResponse & { results: Partial<Record<LevelId, RebuildResult>> }> => {
  const { levelId } = await parseBody(req, RebuildSchema);
  return { ok: true, results: await rebuildDigests({ user, ip }, levelId) };
});
