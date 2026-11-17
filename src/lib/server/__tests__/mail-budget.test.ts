/**
 * Daily recipient budget of report emails, pure parts (no emulators): the cost of a send (to + cc of every message),
 * the Retry-After until the next VN day, the Vietnamese refusal. The Firestore counter (429, nothing queued, counting,
 * cleanup, no client access) is covered by report-mail-routes.test.ts and mail-routes.test.ts.
 */
import { describe, expect, it } from "vitest";
import { MAIL_DAILY_REPORT_RECIPIENTS, MAIL_MAX_RECIPIENTS, MAIL_MAX_TARGETS } from "../../constants";
import { MAIL_BUDGET_MSG, reportRecipientCost, secondsUntilNextVnDay } from "../mail/budget";

describe("report recipient budget", () => {
  it("a send costs to + cc of each message (Exchange counts every message on its own)", () => {
    expect(reportRecipientCost([])).toBe(0);
    expect(
      reportRecipientCost([
        { recipients: ["bgh@example.edu.vn"], cc: ["cc@example.edu.vn", "admin@example.edu.vn"] },
        { recipients: ["to6@example.edu.vn", "gv.6a01@example.edu.vn"], cc: ["cc@example.edu.vn", "admin@example.edu.vn"] },
      ]),
    ).toBe(7);
  });

  it("leaves headroom in the mailbox's ~10,000 recipients / 24 h (two VN days can share one 24 h window)", () => {
    expect(2 * MAIL_DAILY_REPORT_RECIPIENTS).toBeLessThan(10_000);
    // One maximal request alone is above the daily budget: it is refused as a whole, never partly queued.
    expect(MAIL_MAX_TARGETS * MAIL_MAX_RECIPIENTS).toBeGreaterThan(MAIL_DAILY_REPORT_RECIPIENTS);
  });

  it("Retry-After: seconds until the next midnight in Vietnam (UTC+7)", () => {
    expect(secondsUntilNextVnDay(Date.parse("2026-11-17T16:59:59.000Z"))).toBe(1); // 23:59:59 VN
    expect(secondsUntilNextVnDay(Date.parse("2026-11-17T17:00:00.000Z"))).toBe(86_400); // 00:00 VN
    expect(secondsUntilNextVnDay(Date.parse("2026-11-17T03:00:00.000Z"))).toBe(14 * 3_600); // 10:00 VN
  });

  it("the refusal explains the cap, the cost and what is left (Vietnamese number format)", () => {
    expect(MAIL_BUDGET_MSG.exceeded(1250, 40)).toBe(
      "Hộp thư gửi của trường đã gần hết hạn mức thư báo cáo hôm nay (tối đa 3.000 lượt người nhận mỗi ngày cho tất cả các cấp): " +
        "lượt gửi này cần 1.250 lượt người nhận, hôm nay chỉ còn 40. Vui lòng bớt người nhận hoặc gửi lại vào ngày mai.",
    );
  });
});
