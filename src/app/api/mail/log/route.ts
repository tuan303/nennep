import { MailLogQuerySchema, type MailLogResponse } from "@/lib/contract";
import { apiHandler, parseQuery } from "@/lib/server/handler";
import { listMailLog } from "@/lib/server/mail/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nhật ký gửi thư of a level (?level&limit ≤ 200), newest first, without the message payloads. */
export const GET = apiHandler({ permission: "settings.manage" }, async ({ req, user }): Promise<MailLogResponse> => {
  const { level, limit } = parseQuery(req, MailLogQuerySchema);
  return { items: await listMailLog(user, level, limit) };
});
