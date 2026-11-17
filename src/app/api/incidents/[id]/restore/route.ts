import type { Incident } from "@/lib/types";
import { apiHandler } from "@/lib/server/handler";
import { restoreIncident } from "@/lib/server/incidents";
import { noticeHooks } from "@/lib/server/mail/notice-drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Room for the GVCN notice drain scheduled after the response (notice-drain.ts). */
export const maxDuration = 60;

/** Restore a soft-deleted incident (Admin). */
export const POST = apiHandler<{ id: string }>({ permission: "record.delete" }, async ({ req, user, ip, params }): Promise<Incident> =>
  restoreIncident({ user, ip, ...noticeHooks(req) }, params.id),
);
