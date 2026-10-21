import { IncidentCreateSchema, type ListResponse } from "@/lib/contract";
import type { Incident } from "@/lib/types";
import { requireLevel } from "@/lib/server/auth";
import { Errors } from "@/lib/server/errors";
import { apiHandler, created, flagParam, levelParam, parseBody, withStatus } from "@/lib/server/handler";
import { createIncident, listDeletedIncidents } from "@/lib/server/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create an incident → 201 (200 with the existing record when clientRequestId was already used). */
export const POST = apiHandler({ permission: "incident.create" }, async ({ req, user, ip }) => {
  const input = await parseBody(req, IncidentCreateSchema);
  const { incident, created: isNew } = await createIncident({ user, ip }, input);
  return isNew ? created(incident) : withStatus(200, incident);
});

/** Soft-deleted incidents of a level (?level=THCS&deleted=1). Live data comes from /api/dataset. */
export const GET = apiHandler({ permission: "record.delete" }, async ({ req, user }): Promise<ListResponse<Incident>> => {
  const levelId = levelParam(req);
  requireLevel(user, levelId);
  if (!flagParam(req, "deleted")) {
    throw Errors.validation("Chỉ hỗ trợ xem danh sách đã xóa (deleted=1). Dữ liệu đang dùng được lấy qua /api/dataset.");
  }
  return { items: await listDeletedIncidents(levelId) };
});
