import type { MeResponse } from "@/lib/contract";
import { meResponse } from "@/lib/server/auth";
import { apiHandler } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current user's profile + accessible levels. */
export const GET = apiHandler({}, async ({ user }): Promise<MeResponse> => meResponse(user.profile));
