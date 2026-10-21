import type { RankingsResponse } from "@/lib/contract";
import { getRankings, RankingsQuerySchema } from "@/lib/server/admin/rankings";
import { apiHandler, parseQuery } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?level&mode&key&classCode&grade → per-grade ranking (no mode = current week). classCode only highlights. */
export const GET = apiHandler({ permission: "view.dashboard" }, async ({ req, user }): Promise<RankingsResponse> =>
  getRankings(user, parseQuery(req, RankingsQuerySchema)),
);
