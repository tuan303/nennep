import { BulkGvcnSchema, type BulkGvcnResult } from "@/lib/contract";
import { bulkCreateGvcn } from "@/lib/server/admin/bulk-gvcn";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GVCN accounts for every active class of a level that has a homeroom email (grouped by email).
 * `sync: true` also removes assignments of this level that no longer match the class list.
 */
export const POST = apiHandler({ permission: "users.manage" }, async ({ req, user, ip }): Promise<BulkGvcnResult> => {
  const { levelId, sync } = await parseBody(req, BulkGvcnSchema);
  return bulkCreateGvcn({ user, ip }, levelId, { sync });
});
