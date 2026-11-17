/** Email data model: report.send permission, labels/limits, outbox ids and the contract schemas (fake addresses only). */
import { describe, expect, it } from "vitest";
import {
  MAIL_JOB_KIND_LABELS,
  MAIL_JOB_STATUS_LABELS,
  MAIL_MAX_RECIPIENTS,
  MAIL_MAX_TARGETS,
  MAIL_NOTE_MAX,
  ROLES,
  hasPermission,
} from "../../constants";
import {
  MailLogQuerySchema,
  MailSettingsSchema,
  ReportMailRecipientsQuerySchema,
  ReportMailSendSchema,
  ReportPdfQuerySchema,
  zEmail,
  type MailSettingsInput,
  type ReportMailSendInput,
} from "../../contract";
import { COL, mailJobId } from "../../firestore-paths";
import type { Role } from "../../types";

const emails = (n: number) => Array.from({ length: n }, (_, i) => `gv.${i + 1}@example.edu.vn`);
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe("report.send permission", () => {
  it("only ADMIN and EDITOR may send the report by email (VIEWER and GVCN may not)", () => {
    const can = (role: Role) => hasPermission({ role, active: true, levels: [] }, "report.send");
    expect(ROLES.filter(can)).toEqual(["ADMIN", "EDITOR"]);
    expect(hasPermission({ role: "EDITOR", active: true, levels: ["THCS"] }, "report.send")).toBe(true);
    expect(hasPermission({ role: "ADMIN", active: false, levels: [] }, "report.send")).toBe(false);
  });

  it("mail settings stay under settings.manage (ADMIN only)", () => {
    expect(ROLES.filter((role) => hasPermission({ role, active: true, levels: [] }, "settings.manage"))).toEqual(["ADMIN"]);
  });
});

describe("labels and limits", () => {
  it("labels every job status and kind in Vietnamese", () => {
    expect(MAIL_JOB_STATUS_LABELS).toEqual({ PENDING: "Đang chờ", SENDING: "Đang gửi", SENT: "Đã gửi", FAILED: "Lỗi", SKIPPED: "Bỏ qua" });
    expect(MAIL_JOB_KIND_LABELS).toEqual({ NOTICE: "Thông báo GVCN", REPORT: "Báo cáo", TEST: "Thư thử" });
    expect([MAIL_MAX_RECIPIENTS, MAIL_MAX_TARGETS, MAIL_NOTE_MAX]).toEqual([50, 200, 1000]);
  });
});

describe("mailJobId", () => {
  it("is the inverted 13-digit timestamp + 8 base36 characters", () => {
    const id = mailJobId(1_790_000_000_000, () => 0.5);
    expect(id).toBe("8209999999999_iiiiiiii");
    expect(mailJobId()).toMatch(/^\d{13}_[0-9a-z]{8}$/);
    expect(mailJobId(0, () => 0.999999)).toBe("9999999999999_zzzzzzzz");
  });

  it("sorts newest first in ascending document-id order", () => {
    const ids = [1_790_000_000_000, 1_790_000_000_001, 1_800_000_000_000].map((t) => mailJobId(t));
    expect([...ids].sort()).toEqual([...ids].reverse());
  });

  it("uses the email collections", () => {
    expect([COL.mailSettings, COL.mailOutbox, COL.printJobs]).toEqual(["mailSettings", "mailOutbox", "printJobs"]);
  });
});

describe("contract schemas", () => {
  const settings = (over: Partial<MailSettingsInput> = {}): MailSettingsInput => ({
    notices: { enabled: true, incidents: true, rewards: false },
    report: { bgh: ["BGH@example.edu.vn"], grades: { "6": ["To.Khoi6@example.edu.vn", "to.khoi6@example.edu.vn"] }, cc: [] },
    allowedDomains: ["@Example.edu.vn", "example.edu.vn"],
    ...over,
  });

  it("zEmail normalises before validating", () => {
    expect(zEmail.parse("  <GV.6A01@Example.edu.vn> ")).toBe("gv.6a01@example.edu.vn");
    expect(messages(zEmail.safeParse("gv.6a01"))).toEqual(["Địa chỉ email không hợp lệ: gv.6a01"]);
    expect(messages(zEmail.safeParse(" "))).toEqual(["Thiếu địa chỉ email"]);
  });

  it("MailSettingsSchema normalises and deduplicates addresses and domains", () => {
    const parsed = MailSettingsSchema.parse({ ...settings(), baseRev: 2 });
    expect(parsed.report).toEqual({ bgh: ["bgh@example.edu.vn"], grades: { "6": ["to.khoi6@example.edu.vn"] }, cc: [] });
    expect(parsed.allowedDomains).toEqual(["example.edu.vn"]);
    expect(parsed.baseRev).toBe(2);
    expect(MailSettingsSchema.parse(settings({ report: { bgh: [], cc: [] } })).report.grades).toEqual({});
  });

  it("MailSettingsSchema rejects invalid addresses, domains, grade keys and long lists", () => {
    expect(messages(MailSettingsSchema.safeParse(settings({ report: { bgh: ["bgh@"], grades: {}, cc: [] } })))).toEqual(["Địa chỉ email không hợp lệ: bgh@"]);
    expect(messages(MailSettingsSchema.safeParse(settings({ allowedDomains: ["https://example.edu.vn"] })))).toEqual([
      "Tên miền không hợp lệ: https://example.edu.vn – ví dụ: example.edu.vn",
    ]);
    expect(MailSettingsSchema.safeParse(settings({ report: { bgh: [], grades: { "khoi-6": [] }, cc: [] } })).success).toBe(false);
    expect(messages(MailSettingsSchema.safeParse(settings({ report: { bgh: emails(51), grades: {}, cc: [] } })))).toEqual([
      "Tối đa 50 địa chỉ email trong một danh sách",
    ]);
    expect(MailSettingsSchema.safeParse(settings({ report: { bgh: emails(50), grades: {}, cc: [] } })).success).toBe(true);
  });

  const send = (over: Record<string, unknown> = {}): ReportMailSendInput =>
    ({
      levelId: "THCS",
      mode: "week",
      key: "2026-10-19",
      detail: false,
      ccSelf: true,
      targets: [
        { to: "bgh", recipients: ["BGH@example.edu.vn"] },
        { to: "khoi-6", recipients: ["to.khoi6@example.edu.vn"] },
        { to: "lop-6A01", recipients: ["gv.6a01@example.edu.vn", "GV.6A01@example.edu.vn"] },
      ],
      ...over,
    }) as ReportMailSendInput;

  it("ReportMailSendSchema accepts week / month periods and normalises recipients", () => {
    const parsed = ReportMailSendSchema.parse(send({ note: "  Kính gửi thầy cô.  " }));
    expect(parsed.targets.map((t) => t.recipients)).toEqual([["bgh@example.edu.vn"], ["to.khoi6@example.edu.vn"], ["gv.6a01@example.edu.vn"]]);
    expect(parsed.note).toBe("Kính gửi thầy cô.");
    expect(ReportMailSendSchema.parse(send({ mode: "month", key: "2026-10" })).key).toBe("2026-10");
  });

  it("ReportMailSendSchema rejects bad periods, recipient keys, empty / duplicate targets and long notes", () => {
    expect(ReportMailSendSchema.safeParse(send({ mode: "month", key: "2026-10-19" })).success).toBe(false);
    expect(messages(ReportMailSendSchema.safeParse(send({ targets: [{ to: "lop 6A01", recipients: ["gv.6a01@example.edu.vn"] }] })))).toEqual([
      "Người nhận báo cáo không hợp lệ",
    ]);
    expect(messages(ReportMailSendSchema.safeParse(send({ targets: [] })))).toEqual(["Chọn ít nhất 1 người nhận"]);
    expect(messages(ReportMailSendSchema.safeParse(send({ targets: [{ to: "bgh", recipients: [] }] })))).toEqual(["Cần ít nhất 1 địa chỉ email"]);
    const dup = send({ targets: [{ to: "bgh", recipients: ["a@example.edu.vn"] }, { to: "bgh", recipients: ["b@example.edu.vn"] }] });
    expect(messages(ReportMailSendSchema.safeParse(dup))).toEqual(["Người nhận bị trùng: bgh"]);
    expect(messages(ReportMailSendSchema.safeParse(send({ note: "x".repeat(MAIL_NOTE_MAX + 1) })))).toEqual(["Lời nhắn tối đa 1000 ký tự"]);
    const many = Array.from({ length: MAIL_MAX_TARGETS + 1 }, (_, i) => ({ to: `lop-6A${i}`, recipients: ["gv@example.edu.vn"] }));
    expect(messages(ReportMailSendSchema.safeParse(send({ targets: many })))).toEqual(["Tối đa 200 thư trong một lần gửi"]);
  });

  it("query schemas: mail log limit, recipients level, PDF period / recipient / detail", () => {
    expect(MailLogQuerySchema.parse({ level: "THPT" })).toEqual({ level: "THPT", limit: 100 });
    expect(MailLogQuerySchema.parse({ level: "TH", limit: "20" })).toEqual({ level: "TH", limit: 20 });
    expect(MailLogQuerySchema.safeParse({ level: "TH", limit: "500" }).success).toBe(false);
    expect(ReportMailRecipientsQuerySchema.safeParse({ level: "THCS" }).success).toBe(true);
    expect(ReportMailRecipientsQuerySchema.safeParse({ level: "X" }).success).toBe(false);
    expect(ReportPdfQuerySchema.parse({ level: "THCS", mode: "week", key: "2026-10-19", to: "lop-6A01", detail: "1" })).toEqual({
      level: "THCS",
      mode: "week",
      key: "2026-10-19",
      to: "lop-6A01",
      detail: "1",
    });
    expect(ReportPdfQuerySchema.parse({ level: "THCS", mode: "month", key: "2026-10", to: "bgh" }).detail).toBe("0");
    expect(ReportPdfQuerySchema.safeParse({ level: "THCS", mode: "week", key: "2026-10-19", to: "bgh", detail: "yes" }).success).toBe(false);
  });
});
