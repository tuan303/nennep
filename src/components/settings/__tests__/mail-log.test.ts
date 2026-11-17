import { describe, expect, it } from "vitest";
import type { MailJobView } from "@/lib/contract";
import {
  canRetryMailJob,
  filterMailLog,
  mailJobTime,
  mailLogCounts,
  mailLogSummary,
  mailProblemText,
  mailRecipientsText,
  mailStatusOptions,
  markMailJobRetried,
} from "../mail/lib/mail-log";

const job = (over: Partial<MailJobView> = {}): MailJobView => ({
  id: "8239999999999_abc12345",
  levelId: "THCS",
  kind: "REPORT",
  status: "SENT",
  to: ["bgh@example.edu.vn"],
  cc: [],
  attempts: 1,
  nextAttemptAt: "2026-10-21T08:00:00.000Z",
  createdAt: "2026-10-21T08:00:00.000Z",
  createdBy: "u1",
  createdByName: "Cán bộ A",
  label: "Báo cáo · Ban Giám hiệu",
  ...over,
});

describe("mail log view model", () => {
  const items = [
    job({ id: "1", status: "FAILED", lastError: "Ứng dụng chưa được cấp quyền gửi thư" }),
    job({ id: "2", status: "SENT", sentAt: "2026-10-21T08:01:00.000Z" }),
    job({ id: "3", status: "SKIPPED", skipReason: "Lớp chưa có email GVCN", kind: "NOTICE", to: [] }),
    job({ id: "4", status: "PENDING", kind: "NOTICE", to: [] }),
    job({ id: "5", status: "SENDING" }),
  ];

  it("counts, filters and summarises", () => {
    expect(mailLogCounts(items)).toEqual({ PENDING: 1, SENDING: 1, SENT: 1, FAILED: 1, SKIPPED: 1 });
    expect(filterMailLog(items, "FAILED").map((j) => j.id)).toEqual(["1"]);
    expect(filterMailLog(items).length).toBe(5);
    expect(mailLogSummary(items)).toBe("5 thư gần nhất · 1 lỗi · 1 bỏ qua · 2 đang chờ gửi");
    expect(mailLogSummary([job()])).toBe("1 thư gần nhất");
    expect(mailLogSummary([])).toBe("Chưa có thư nào");
  });

  it("offers only the statuses present, problems first", () => {
    expect(mailStatusOptions(items).map((o) => o.label)).toEqual(["Lỗi (1)", "Bỏ qua (1)", "Đang chờ (1)", "Đang gửi (1)", "Đã gửi (1)"]);
    expect(mailStatusOptions([job()])).toEqual([{ value: "SENT", label: "Đã gửi (1)" }]);
  });

  it("allows Gửi lại only for failed or skipped jobs", () => {
    expect(items.filter(canRetryMailJob).map((j) => j.id)).toEqual(["1", "3"]);
  });

  it("describes recipients (notices resolve them at send time)", () => {
    expect(mailRecipientsText(job({ to: ["a@example.edu.vn", "b@example.edu.vn", "c@example.edu.vn"], cc: ["d@example.edu.vn"] }))).toBe(
      "a@example.edu.vn, b@example.edu.vn +1 · CC 1",
    );
    expect(mailRecipientsText(job({ kind: "NOTICE", status: "PENDING", to: [] }))).toBe("Xác định khi gửi");
    expect(mailRecipientsText(job({ kind: "NOTICE", status: "SKIPPED", to: [] }))).toBe("–");
  });

  it("explains failures, skips and pending retries", () => {
    expect(mailProblemText(items[0])).toBe("Ứng dụng chưa được cấp quyền gửi thư");
    expect(mailProblemText(job({ status: "FAILED" }))).toBe("Không gửi được.");
    expect(mailProblemText(items[2])).toBe("Lớp chưa có email GVCN");
    expect(mailProblemText(job({ status: "PENDING", attempts: 2, lastError: "Máy chủ bận" }))).toBe("Lần 2 chưa gửi được (sẽ thử lại): Máy chủ bận");
    expect(mailProblemText(items[1])).toBeUndefined();
  });

  it("shows the sending time once sent", () => {
    expect(mailJobTime(items[1])).toBe("2026-10-21T08:01:00.000Z");
    expect(mailJobTime(items[0])).toBe("2026-10-21T08:00:00.000Z");
  });

  it("puts a retried job back in the queue optimistically", () => {
    const next = markMailJobRetried(items, "1", "2026-10-21T09:00:00.000Z");
    expect(next[0]).toMatchObject({ id: "1", status: "PENDING", attempts: 0, nextAttemptAt: "2026-10-21T09:00:00.000Z" });
    expect("lastError" in next[0]).toBe(false);
    expect(next[1]).toBe(items[1]);
  });
});
