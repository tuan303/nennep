import { ReportPlanPutSchema, ReportPlanQuerySchema, type ReportPlanResponse } from "@/lib/contract";
import type { ReportPlan } from "@/lib/types";
import { apiHandler, levelParam, parseBody } from "@/lib/server/handler";
import { getReportPlan, saveReportPlan } from "@/lib/server/report-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Công tác phối hợp tuần/tháng mới" of a report period (?level&mode=week|month&key=Monday|yyyy-mm); plan null when not written yet. */
export const GET = apiHandler({ permission: "view.dashboard" }, async ({ req, user }): Promise<ReportPlanResponse> => {
  const sp = new URL(req.url).searchParams;
  const query = ReportPlanQuerySchema.parse({ levelId: levelParam(req), mode: sp.get("mode") ?? undefined, key: sp.get("key") ?? undefined });
  return { plan: await getReportPlan(user, query) };
});

/** Replace the plan of a level & report period (empty list + no note clears it); stale `baseRev` → 409. */
export const PUT = apiHandler({ permission: "report.plan" }, async ({ req, user, ip }): Promise<ReportPlan> => {
  const input = await parseBody(req, ReportPlanPutSchema);
  return saveReportPlan({ user, ip }, input);
});
