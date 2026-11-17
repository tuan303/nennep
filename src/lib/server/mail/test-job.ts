/**
 * TEST job ("Gửi thư thử tới tôi" in Cài đặt → Email): a short message proving that the Microsoft 365 connection
 * works. `buildTestMail` is pure; the recipients were fixed when the job was created (the caller's own address).
 */
import { LEVELS, SCHOOL_NAME, TIME_ZONE } from "../../constants";
import type { LevelId } from "../../types";
import { AUTO_MAIL_FOOTER, buttonHtml, detailsTableHtml, emailDocumentHtml, paragraphHtml } from "./html";
import type { JobBuilder } from "./types";

export const TEST_MAIL_SUBJECT = "[Nền nếp] Thư thử – kết nối gửi email hoạt động";

export interface TestMailContext {
  baseUrl: string;
  levelId: LevelId;
  sender?: string;
  requestedBy: string;
  /** ISO timestamp of the request. */
  at: string;
}

const VN_TIME = new Intl.DateTimeFormat("vi-VN", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "medium" });

export function buildTestMail(ctx: TestMailContext): { subject: string; html: string; text: string } {
  const level = LEVELS[ctx.levelId].name;
  const when = VN_TIME.format(new Date(ctx.at));
  const intro = "Đây là thư thử do phần mềm Nền nếp gửi. Nếu thầy/cô nhận được thư này, cấu hình gửi email qua Microsoft 365 đã hoạt động.";
  const rows = [
    { label: "Hộp thư gửi", value: ctx.sender ?? "" },
    { label: "Cấp học", value: level },
    { label: "Người yêu cầu", value: ctx.requestedBy },
    { label: "Thời điểm", value: when },
  ];
  const link = `${ctx.baseUrl}/cai-dat`;
  const footerLines = [AUTO_MAIL_FOOTER, `${SCHOOL_NAME} · ${level}`];
  const html = emailDocumentHtml({
    title: TEST_MAIL_SUBJECT,
    preheader: intro,
    heading: "Thư thử gửi email",
    bodyHtml: [paragraphHtml(intro), detailsTableHtml(rows), buttonHtml(link, "Mở Cài đặt")].join(""),
    footerLines,
  });
  const text = [intro, "", ...rows.filter((r) => r.value).map((r) => `${r.label}: ${r.value}`), "", `Cài đặt: ${link}`, "", ...footerLines].join("\n");
  return { subject: TEST_MAIL_SUBJECT, html, text };
}

export const buildTestJob: JobBuilder = async (job, ctx) => {
  const content = buildTestMail({ baseUrl: ctx.baseUrl, levelId: job.levelId, sender: ctx.transport.sender, requestedBy: job.createdByName, at: job.createdAt });
  return { mail: { to: job.to, cc: job.cc, ...content } };
};
