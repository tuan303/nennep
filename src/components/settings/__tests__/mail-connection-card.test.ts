/**
 * SSR of the "Kết nối gửi thư" card of Cài đặt → Email: report PDFs switched off on the server (MailStatus.pdfWarning,
 * e.g. a PRINT_JOB_SECRET shorter than 32 characters) are shown, configured or not; nothing when PDFs work.
 * Fictional data only.
 */
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MailStatus } from "@/lib/contract";
import { PRINT_KEY_WARNING } from "@/lib/server/mail/print-key";
import { ConnectionCard } from "../mail/connection-card";

(globalThis as { React?: typeof React }).React = React;

const noop = () => undefined;
const configured: MailStatus = {
  configured: true,
  sender: "nennep@example.edu.vn",
  senderName: "Nền nếp NSHM",
  allowedDomains: ["example.edu.vn"],
  baseUrl: "https://nennep.example.edu.vn",
  missing: [],
};

/** Text content of the markup (entities decoded the way the card's strings need). */
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("ConnectionCard – report PDFs off", () => {
  it("shows why PDFs are off, with the PDF-less consequence for report emails", () => {
    const html = renderToStaticMarkup(
      h(ConnectionCard, { status: { ...configured, pdfWarning: PRINT_KEY_WARNING["too-short"] }, userEmail: "admin@example.edu.vn", testing: false, onTest: noop }),
    );
    const t = text(html);
    expect(t).toContain(`File PDF đính kèm đang tắt: ${PRINT_KEY_WARNING["too-short"]}`);
    expect(t).toContain("PRINT_JOB_SECRET ngắn hơn 32 ký tự");
    expect(t).toContain("Thư báo cáo vẫn được gửi nhưng không kèm file PDF");
    expect(t).toContain("Đã cấu hình");
  });

  it("also while mail is not configured (“Tải PDF” needs the key too)", () => {
    const status: MailStatus = { configured: false, allowedDomains: [], baseUrl: "http://localhost:3000", missing: ["MAIL_SENDER"], pdfWarning: PRINT_KEY_WARNING.missing };
    const t = text(renderToStaticMarkup(h(ConnectionCard, { status, testing: false, onTest: noop })));
    expect(t).toContain(`File PDF đính kèm đang tắt: ${PRINT_KEY_WARNING.missing}`);
    expect(t).toContain("Chưa cấu hình");
  });

  it("nothing about PDFs when they work", () => {
    const t = text(renderToStaticMarkup(h(ConnectionCard, { status: configured, testing: false, onTest: noop })));
    expect(t).not.toContain("File PDF đính kèm đang tắt");
  });
});
