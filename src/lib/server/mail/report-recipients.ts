/**
 * Default recipients of the "Gửi email" dialog of Báo cáo tuần/tháng (GET /api/reports/mail/recipients):
 * - Ban Giám hiệu → MailSettings.report.bgh; Tổ khối N → report.grades[N]; always-CC → report.cc;
 * - GVCN lớp X → the class's GVCN addresses (recipients.ts allClassRecipients: active GVCN accounts of the class ∪
 *   ClassInfo.homeroomEmail – the same rule as the GVCN notices).
 * Only the recipients the caller may address (recipientOptions, like the report screen) are listed, and only addresses
 * inside the effective allowed domains are offered; the others are reported once in `blocked`.
 */
import { recipientOptions, type RecipientOption } from "@/components/report/lib/report-model";
import type { MailStatus, ReportMailClassRecipients, ReportMailRecipientsResponse } from "../../contract";
import { partitionByDomain } from "../../mail/address";
import type { LevelId, MailSettings } from "../../types";
import { requireLevel, type SessionUser } from "../auth";
import { loadReference } from "../reference";
import { allClassRecipients } from "./recipients";
import { loadMailSettings } from "./settings";
import { mailStatus } from "./transport";

export interface ReportRecipientsInput {
  /** mailStatus of the level: `allowedDomains` = the effective allowed domains. */
  status: MailStatus;
  settings: Pick<MailSettings, "report">;
  /** recipientOptions of the caller. */
  options: readonly RecipientOption[];
  /** allClassRecipients of the level (allowed addresses per active class + the blocked ones). */
  classRecipients: { classes: readonly ReportMailClassRecipients[]; blocked: readonly string[] };
}

/** The dialog defaults (pure), in the order of the report screen's recipient list. */
export function buildReportMailRecipients(input: ReportRecipientsInput): ReportMailRecipientsResponse {
  const domains = input.status.allowedDomains;
  const blocked = new Set<string>();
  const allowed = (list: readonly string[]): string[] => {
    const parts = partitionByDomain(list, domains);
    for (const b of parts.blocked) blocked.add(b);
    return parts.allowed;
  };
  const { report } = input.settings;
  const rows = new Map(input.classRecipients.classes.map((c) => [c.classCode, c] as const));

  const bgh = input.options.some((o) => o.recipient.kind === "bgh") ? allowed(report.bgh) : [];
  const cc = allowed(report.cc);
  const grades = input.options.flatMap((o) =>
    o.recipient.kind === "grade" ? [{ grade: o.recipient.grade, recipients: allowed(report.grades[String(o.recipient.grade)] ?? []) }] : [],
  );
  const classes = input.options.flatMap((o) => {
    const row = o.recipient.kind === "class" ? rows.get(o.recipient.classCode) : undefined;
    return row ? [row] : [];
  });
  for (const b of input.classRecipients.blocked) blocked.add(b);
  return { status: input.status, bgh, cc, grades, classes, blocked: [...blocked] };
}

/**
 * GET /api/reports/mail/recipients (report.send + level). `origin` = request origin (base URL fallback of the status).
 * `fresh`: settings read from Firestore, not the per-instance cache (Cài đặt → Email right after a save, which only
 * clears the cache of the instance that handled it); the report dialog keeps the cached read.
 */
export async function reportMailRecipients(user: SessionUser, levelId: LevelId, origin?: string, opts: { fresh?: boolean } = {}): Promise<ReportMailRecipientsResponse> {
  requireLevel(user, levelId);
  const [ref, settings] = await Promise.all([loadReference(levelId), loadMailSettings(levelId, { fresh: opts.fresh === true })]);
  return buildReportMailRecipients({
    status: mailStatus(origin, settings.allowedDomains),
    settings,
    options: recipientOptions(user.profile, { levelId, classes: ref.classes }),
    classRecipients: await allClassRecipients(levelId, settings),
  });
}
