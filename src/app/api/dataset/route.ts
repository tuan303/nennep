import { NextResponse } from "next/server";
import { requireLevel } from "@/lib/server/auth";
import { buildLevelDataset, datasetEtag, etagMatches, redactForGvcn } from "@/lib/server/dataset";
import { apiHandler, jsonResponse, levelParam } from "@/lib/server/handler";
import { readVersion } from "@/lib/server/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dataset?level=THCS → LevelDataset (GVCN redacted).
 * ETag = W/"<meta/versions[level]>"; If-None-Match with the current version → 304 without reading digests.
 * `Vary: Authorization` keeps shared/browser caches from serving one user's dataset to another.
 */
export const GET = apiHandler({ permission: "view.dashboard" }, async ({ req, user }) => {
  const levelId = levelParam(req);
  requireLevel(user, levelId);
  const version = await readVersion(levelId);
  const headers = { ETag: datasetEtag(version), "Cache-Control": "private, no-cache", Vary: "Authorization" };
  if (etagMatches(req.headers.get("if-none-match"), version)) {
    return new NextResponse(null, { status: 304, headers });
  }
  const dataset = redactForGvcn(await buildLevelDataset(levelId, version), user.profile);
  return jsonResponse(dataset, 200, headers);
});
