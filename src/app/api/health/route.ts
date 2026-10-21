import { apiHandler } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness probe (no Firestore reads). */
export const GET = apiHandler({ public: true }, async (): Promise<{ ok: true; time: string }> => ({
  ok: true,
  time: new Date().toISOString(),
}));
