import type { Incident } from "@/lib/types";
import { apiHandler } from "@/lib/server/handler";
import { restoreIncident } from "@/lib/server/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Restore a soft-deleted incident (Admin). */
export const POST = apiHandler<{ id: string }>({ permission: "record.delete" }, async ({ user, ip, params }): Promise<Incident> =>
  restoreIncident({ user, ip }, params.id),
);
