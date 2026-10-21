import type { MeResponse } from "@/lib/contract";
import { apiHandler } from "@/lib/server/handler";
import { recordLogin } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called by the client right after Firebase sign-in: audit LOGIN, set lastLoginAt, return the profile. */
export const POST = apiHandler({}, async ({ user, ip }): Promise<MeResponse> => recordLogin(user, ip));
