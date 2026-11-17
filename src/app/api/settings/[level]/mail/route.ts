import { MailSettingsSchema, type MailSettingsResponse } from "@/lib/contract";
import { levelFromParam } from "@/lib/server/admin/common";
import { requireLevel } from "@/lib/server/auth";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { loadMailSettings, saveMailSettings } from "@/lib/server/mail/settings";
import { mailStatus } from "@/lib/server/mail/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { level: string };

/**
 * Cài đặt → Email of a level (defaults when never saved) + the sending configuration (never a secret). Read fresh,
 * never from the per-instance cache: the editor sends this rev back as `baseRev` (also after a 409 "Tải bản mới nhất").
 */
export const GET = apiHandler<Params>({ permission: "settings.manage" }, async ({ req, user, params }): Promise<MailSettingsResponse> => {
  const levelId = levelFromParam(params.level);
  requireLevel(user, levelId);
  const settings = await loadMailSettings(levelId, { fresh: true });
  return { settings, status: mailStatus(req.nextUrl.origin, settings.allowedDomains) };
});

/** Replace the mail settings of the level (grades of the level only); audit UPDATE_MAIL_SETTINGS; stale `baseRev` → 409. */
export const PUT = apiHandler<Params>({ permission: "settings.manage" }, async ({ req, user, ip, params }): Promise<MailSettingsResponse> => {
  const levelId = levelFromParam(params.level);
  const input = await parseBody(req, MailSettingsSchema);
  const settings = await saveMailSettings({ user, ip }, levelId, input);
  return { settings, status: mailStatus(req.nextUrl.origin, settings.allowedDomains) };
});
