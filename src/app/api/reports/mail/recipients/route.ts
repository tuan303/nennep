import { ReportMailRecipientsQuerySchema, type ReportMailRecipientsResponse } from "@/lib/contract";
import { apiHandler, parseQuery } from "@/lib/server/handler";
import { reportMailRecipients } from "@/lib/server/mail/report-recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Default recipients of the "Gửi email" dialog (?level): BGH, tổ khối, GVCN of each class, CC; blocked addresses.
 * `fresh=1` (coverage of Cài đặt → Email) reads the mail settings uncached.
 */
export const GET = apiHandler({ permission: "report.send" }, async ({ req, user }): Promise<ReportMailRecipientsResponse> => {
  const { level, fresh } = parseQuery(req, ReportMailRecipientsQuerySchema);
  return reportMailRecipients(user, level, req.nextUrl.origin, { fresh: fresh === "1" });
});
