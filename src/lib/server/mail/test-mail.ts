/**
 * POST /api/settings/:level/mail/test – "Gửi thư thử tới tôi": sends a TEST message to the caller's own address right
 * now (synchronously) and reports the outcome. 409 when mail is not configured, 400 when the caller's address is not
 * inside the allowed domains; at most TEST_MAIL_LIMIT sends per user per TEST_MAIL_WINDOW_MS (429). Every send is a
 * TEST job of the mail log (audit SEND_TEST_EMAIL); a failure is final (FAILED, never retried later).
 */
import type { MailTestResponse } from "../../contract";
import { isAllowedDomain, isEmail, normalizeEmail } from "../../mail/address";
import type { LevelId } from "../../types";
import { requireLevel, requirePermission } from "../auth";
import { Errors } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import type { ServiceCtx } from "../records";
import { sendClaimedJob } from "./drain";
import { createTestJob } from "./outbox";
import { loadMailSettings } from "./settings";
import { buildTestJob } from "./test-job";
import { mailNotConfiguredMessage, mailStatus } from "./transport";

export const TEST_MAIL_LIMIT = 5;
export const TEST_MAIL_WINDOW_MS = 10 * 60_000;

export const TEST_MAIL_MSG = {
  noEmail: "Tài khoản của bạn chưa có địa chỉ email hợp lệ để nhận thư thử.",
  blocked: (email: string, domains: readonly string[]) =>
    `Email ${email} không thuộc tên miền được phép (${domains.length > 0 ? domains.join(", ") : "chưa xác định"}) nên không gửi thư thử được.`,
  failed: "Chưa gửi được thư thử.",
} as const;

export async function sendTestMail(ctx: ServiceCtx, levelId: LevelId, baseUrl: string): Promise<MailTestResponse> {
  const { user } = ctx;
  requirePermission(user, "settings.manage");
  requireLevel(user, levelId);
  const settings = await loadMailSettings(levelId);
  const status = mailStatus(baseUrl, settings.allowedDomains);
  if (!status.configured) throw Errors.conflict(mailNotConfiguredMessage(status.missing));
  const to = normalizeEmail(user.email);
  if (!isEmail(to)) throw Errors.validation(TEST_MAIL_MSG.noEmail);
  if (!isAllowedDomain(to, status.allowedDomains)) throw Errors.validation(TEST_MAIL_MSG.blocked(to, status.allowedDomains));
  enforceRateLimit(`mail-test:${user.uid}`, TEST_MAIL_LIMIT, TEST_MAIL_WINDOW_MS);

  const job = await createTestJob(ctx, levelId, to);
  const done = await sendClaimedJob(job, { builders: { TEST: buildTestJob }, baseUrl });
  if (done.status === "SENT") return { ok: true };
  return { ok: false, error: done.lastError ?? done.skipReason ?? TEST_MAIL_MSG.failed };
}
