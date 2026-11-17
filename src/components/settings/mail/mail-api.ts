/**
 * Typed client of the mail endpoints used by Cài đặt → Email (browser only). Same transport as `api` in
 * src/lib/client/api.ts (Firebase ID token, JSON, Vietnamese `ApiClientError` on failure).
 */
import { requestJson, seg } from "@/lib/client/http";
import type {
  MailLogResponse,
  MailSettingsInput,
  MailSettingsResponse,
  MailTestResponse,
  OkResponse,
  ReportMailRecipientsResponse,
} from "@/lib/contract";
import type { LevelId } from "@/lib/types";
import { MAIL_LOG_LIMIT } from "./lib/mail-log";

export const mailApi = {
  /** Settings of the level (defaults when never saved) + the sending status (no secret). */
  settings: (levelId: LevelId) => requestJson<MailSettingsResponse>(`/api/settings/${seg(levelId)}/mail`),
  /** Replaces the settings; `baseRev` = rev of the version edited (409 CONFLICT when someone saved meanwhile). */
  putSettings: (levelId: LevelId, input: MailSettingsInput) =>
    requestJson<MailSettingsResponse>(`/api/settings/${seg(levelId)}/mail`, { method: "PUT", body: input }),
  /** Sends a test message to the caller's own email now (5 per 10 minutes); `{ ok: false, error }` when refused. */
  sendTest: (levelId: LevelId) => requestJson<MailTestResponse>(`/api/settings/${seg(levelId)}/mail/test`, { method: "POST", body: {} }),
  /** Newest jobs of the level first. */
  log: (levelId: LevelId, limit: number = MAIL_LOG_LIMIT) => requestJson<MailLogResponse>("/api/mail/log", { query: { level: levelId, limit } }),
  /** FAILED / SKIPPED → back in the queue (attempts reset). */
  retry: (id: string) => requestJson<OkResponse>(`/api/mail/jobs/${seg(id)}/retry`, { method: "POST", body: {} }),
  /**
   * Default report recipients; used here for the GVCN coverage of each class (report.send). `fresh=1`: the server reads
   * the settings uncached, so the coverage matches a save that another server instance just handled.
   */
  recipients: (levelId: LevelId) =>
    requestJson<ReportMailRecipientsResponse>("/api/reports/mail/recipients", { query: { level: levelId, fresh: 1 } }),
};
