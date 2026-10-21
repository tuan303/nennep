import { ActionCreateSchema, type ListResponse } from "@/lib/contract";
import type { ActionItem } from "@/lib/types";
import { createAction, listActions } from "@/lib/server/admin/actions";
import { apiHandler, created, levelParam, parseBody } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Actions of a level (?level=THCS), Open → Doing → Done, then by deadline. */
export const GET = apiHandler({ permission: "actions.view" }, async ({ req, user }): Promise<ListResponse<ActionItem>> => ({
  items: await listActions(user, levelParam(req)),
}));

/** Create an action (status Open, code HD-yyyymmdd-NNN) → 201. */
export const POST = apiHandler({ permission: "actions.manage" }, async ({ req, user, ip }) => {
  const input = await parseBody(req, ActionCreateSchema);
  return created(await createAction({ user, ip }, input));
});
