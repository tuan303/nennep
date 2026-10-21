import { ActionUpdateSchema } from "@/lib/contract";
import type { ActionItem } from "@/lib/types";
import { updateAction } from "@/lib/server/admin/actions";
import { apiHandler, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Update an action; moving to "Done" without evidence → 400 (BR-ACT-01 / AC-014). */
export const PATCH = apiHandler<{ id: string }>({ permission: "actions.manage" }, async ({ req, user, ip, params }): Promise<ActionItem> => {
  const patch = await parseBody(req, ActionUpdateSchema);
  return updateAction({ user, ip }, params.id, patch);
});
