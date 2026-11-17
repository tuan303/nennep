/** SSR smoke tests of the "Gửi email" compose / progress views and the new toolbar buttons (node, no DOM). */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { periodOptions } from "@/lib/engine";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { ReportToolbar } from "../../report-toolbar";
import { applyPoll, applyPollError, startWatch, type BatchWatch } from "../lib/mail-batch";
import { initialMailDraft, mailDraftIssues, mailTargetRows, setTargetChecked, type MailDraft } from "../lib/mail-draft";
import { MAIL_SETTINGS_HREF, ReportMailForm, type ReportMailFormProps } from "../report-mail-form";
import { ReportMailProgress } from "../report-mail-progress";
import { DOMAIN, SELF, batchFixture, mailFixture } from "./mail-fixtures";

const noop = () => undefined;

function form(overrides: Partial<ReportMailFormProps> = {}, draftOf?: (d: MailDraft) => MailDraft): string {
  const { ds, options, res } = mailFixture();
  const rows = mailTargetRows(res, options, ds.classes);
  const base = initialMailDraft(rows, "bgh", false);
  const draft = draftOf ? draftOf(base) : base;
  const props: ReportMailFormProps = {
    data: res,
    rows,
    draft,
    onDraft: noop,
    issues: mailDraftIssues(draft, rows, res.cc),
    planDirty: false,
    canManageMail: true,
    selfEmail: SELF,
    initialOpenKey: "bgh",
    ...overrides,
  };
  return renderToStaticMarkup(createElement(ReportMailForm, props));
}

describe("ReportMailForm", () => {
  it("renders the groups, rows, options and note", () => {
    const html = form();
    for (const text of [
      "Ban Giám hiệu",
      "Tổ khối",
      "Tổ khối 6",
      "Tổ khối 7",
      "GVCN từng lớp",
      "Chọn tất cả (0/6 lớp)",
      "Khối 6 (0/4)",
      "6A01",
      "GV Thử Một",
      "Chưa có email GVCN",
      "Kèm bảng chi tiết sự việc",
      "Gửi bản sao cho tôi",
      `Mỗi thư được gửi kèm (CC) tới ${SELF}.`,
      `Luôn gửi kèm (CC) theo cài đặt: <span class="text-slate-700">vanthu@${DOMAIN}</span>`,
      "Lời nhắn",
      "0/1.000",
      "Nền nếp NSHM &lt;nennep@example.edu.vn&gt;",
      `chỉ gửi tới @${DOMAIN}`,
      "1 địa chỉ trong cài đặt không thuộc tên miền được phép nên không được gửi: ngoai@other.example.com",
      // BGH is expanded (toolbar recipient): its address editor.
      "Thêm email (dán được nhiều địa chỉ)",
      `bgh.2@${DOMAIN}`,
    ]) {
      expect(html).toContain(text);
    }
    // Tổ khối 7 has no configured address.
    expect(html).toContain("Chưa cài đặt email tổ khối");
    expect(html).not.toContain("Chưa cấu hình gửi email");
    expect(html).not.toContain("Lưu công tác phối hợp trước khi gửi");
  });

  it("not configured: explains, with the settings link and missing variables for admins only", () => {
    const { res } = mailFixture();
    const data = { ...res, status: { ...res.status, configured: false, missing: ["MS_GRAPH_CLIENT_SECRET", "MAIL_SENDER"] } };
    const admin = form({ data });
    expect(admin).toContain("Chưa cấu hình gửi email");
    expect(admin).toContain(`href="${MAIL_SETTINGS_HREF}"`);
    expect(admin).toContain("Mở Cài đặt → Email");
    expect(admin).toContain("MS_GRAPH_CLIENT_SECRET, MAIL_SENDER");
    const editor = form({ data, canManageMail: false });
    expect(editor).toContain("Vui lòng liên hệ quản trị viên");
    expect(editor).not.toContain(MAIL_SETTINGS_HREF);
    expect(editor).not.toContain("MAIL_SENDER");
  });

  it("no allowed domain known: says why nothing can be sent and where to fix it (once linked)", () => {
    const { ds, options, res } = mailFixture();
    // What GET /api/reports/mail/recipients answers then: every settings / GVCN address dropped and reported as blocked.
    const data = {
      ...res,
      status: { ...res.status, allowedDomains: [] },
      bgh: [],
      cc: [],
      grades: [],
      classes: res.classes.map((c) => ({ ...c, recipients: [], missing: true })),
      blocked: [`bgh.1@${DOMAIN}`, `khoi6@${DOMAIN}`],
    };
    const rows = mailTargetRows(data, options, ds.classes);
    const draft = initialMailDraft(rows, "bgh", false);
    const issues = mailDraftIssues(draft, rows, data.cc);
    const links = (html: string) => html.split(`href="${MAIL_SETTINGS_HREF}"`).length - 1;
    const html = form({ data, rows, draft, issues });
    expect(html).toContain("Chưa xác định tên miền nhận thư");
    expect(html).toContain("(kể cả 2 địa chỉ đã lưu trong cài đặt) đều bị chặn và chưa gửi được báo cáo");
    expect(html).toContain("Mở Cài đặt → Email, nhập “Tên miền được phép”");
    expect(links(html)).toBe(1);
    // Rows point to the notice instead of blaming the lists / the GVCN email; no misleading "outside the domains" list.
    expect(html).toContain("Chưa xác định tên miền nhận thư – xem thông báo phía trên.");
    expect(html).not.toContain("Khai báo email GVCN ở Cài đặt → Lớp &amp; GVCN.");
    expect(html).not.toContain("không thuộc tên miền được phép nên không được gửi");
    // Not configured either: both notices, the settings link only once.
    const both = form({ data: { ...data, status: { ...data.status, configured: false, missing: ["MAIL_SENDER"] } }, rows, draft, issues });
    expect(both).toContain("Chưa cấu hình gửi email");
    expect(both).toContain("Chưa xác định tên miền nhận thư");
    expect(links(both)).toBe(1);
    const editor = form({ data, rows, draft, issues, canManageMail: false });
    expect(editor).toContain("Vui lòng liên hệ quản trị viên để khai báo “Tên miền được phép” trong Cài đặt → Email.");
    expect(editor).not.toContain(MAIL_SETTINGS_HREF);
  });

  it("report PDFs off on the server: warns, stops promising the attachment; reason and link for admins only", () => {
    const { res } = mailFixture();
    const reason = "biến môi trường PRINT_JOB_SECRET ngắn hơn 32 ký tự. Quản trị CNTT đặt giá trị dài ít nhất 32 ký tự (hoặc xóa biến này) trên Vercel rồi triển khai lại (Redeploy).";
    const data = { ...res, status: { ...res.status, pdfWarning: reason } };
    const links = (html: string) => html.split(`href="${MAIL_SETTINGS_HREF}"`).length - 1;
    const admin = form({ data, planDirty: true });
    expect(admin).toContain("File PDF đính kèm đang tắt");
    expect(admin).toContain("Thư vẫn được gửi, có liên kết mở báo cáo trên phần mềm nhưng không kèm file PDF.");
    expect(admin).toContain(`Lý do: ${reason}`);
    expect(links(admin)).toBe(1);
    expect(admin).toContain("Mỗi dòng được chọn là một thư riêng, có liên kết mở báo cáo của người nhận đó (không kèm file PDF).");
    expect(admin).toContain("Thêm bảng liệt kê từng sự việc vào báo cáo mở từ liên kết trong thư.");
    expect(admin).toContain("Thư dùng nội dung đã lưu.");
    expect(admin).not.toContain("kèm file PDF báo cáo");
    expect(admin).not.toContain("file PDF đính kèm dùng");
    expect(admin).not.toContain("vào file PDF đính kèm");
    const editor = form({ data, canManageMail: false });
    expect(editor).toContain("File PDF đính kèm đang tắt");
    expect(editor).toContain("Vui lòng báo quản trị viên để bật lại file PDF đính kèm.");
    expect(editor).not.toContain("PRINT_JOB_SECRET");
    expect(editor).not.toContain("Lý do:");
    expect(links(editor)).toBe(0);
    expect(editor).not.toContain("kèm file PDF báo cáo");
    // Not configured yet: that is the problem to fix first (no PDF notice); no allowed domain: the link stays single.
    const unconfigured = form({ data: { ...data, status: { ...data.status, configured: false, missing: ["MAIL_SENDER"] } } });
    expect(unconfigured).toContain("Chưa cấu hình gửi email");
    expect(unconfigured).not.toContain("File PDF đính kèm đang tắt");
    const noDomains = form({ data: { ...data, status: { ...data.status, allowedDomains: [] } } });
    expect(noDomains).toContain("File PDF đính kèm đang tắt");
    expect(noDomains).toContain("Chưa xác định tên miền nhận thư");
    expect(links(noDomains)).toBe(1);
    // PDFs on: no notice, the attachment is promised.
    const normal = form({ planDirty: true });
    expect(normal).not.toContain("File PDF đính kèm đang tắt");
    expect(normal).toContain("Mỗi dòng được chọn là một thư riêng, kèm file PDF báo cáo của người nhận đó.");
    expect(normal).toContain("Thư và file PDF đính kèm dùng nội dung đã lưu.");
    expect(normal).toContain("Thêm bảng liệt kê từng sự việc vào file PDF đính kèm.");
  });

  it("unsaved plan, send error, row issue and a sender outside the allowed domains", () => {
    const html = form(
      { planDirty: true, sendError: "Có địa chỉ ngoài tên miền được phép.", selfEmail: "ai@other.example.com" },
      (d) => setTargetChecked(d, "khoi-6", true),
    );
    expect(html).toContain("Lưu công tác phối hợp trước khi gửi");
    expect(html).toContain("Chưa gửi được báo cáo");
    expect(html).toContain("Có địa chỉ ngoài tên miền được phép.");
    expect(html).toContain("Email của bạn (ai@other.example.com) không thuộc tên miền được phép nhận thư.");
  });
});

describe("ReportMailProgress", () => {
  const W0 = startWatch({ batchId: "b1", jobs: 3 }, "THCS", "Tuần 19/10 – 25/10/2026", 0);
  const render = (watch: BatchWatch) => renderToStaticMarkup(createElement(ReportMailProgress, { watch, retrying: new Set<string>(), onRetry: noop }));

  it("before the first answer: preparing", () => {
    expect(render(W0)).toContain("Đang chuẩn bị gửi 3 thư…");
  });

  it("per-addressee status, error, time and 'Gửi lại'", () => {
    const html = render(applyPoll(W0, batchFixture(), 1));
    for (const text of ["Đang gửi…", "2/3 thư", "1 đã gửi · 1 lỗi · 1 đang chờ", "Ban Giám hiệu", "Đã gửi", "lúc 14:05", "Tổ khối 6", "Lỗi", "Máy chủ thư từ chối.", "GVCN lớp 6A01", "Đang chờ", "Gửi lại", "Bạn có thể đóng cửa sổ này"]) {
      expect(html).toContain(text);
    }
    expect(html.match(/Gửi lại/g)).toHaveLength(1);
  });

  it("report PDFs off when sent: the progress text does not promise the attachment", () => {
    const off = render(applyPoll(startWatch({ batchId: "b1", jobs: 3 }, "THCS", "Tuần 19/10 – 25/10/2026", 0, { withoutPdf: true }), batchFixture(), 1));
    expect(off).toContain("Mỗi thư có liên kết mở báo cáo (không kèm file PDF) và được gửi lần lượt. Bạn có thể đóng cửa sổ này");
    expect(off).not.toContain("kèm file PDF báo cáo");
    const on = render(applyPoll(W0, batchFixture(), 1));
    expect(on).toContain("Mỗi thư kèm file PDF báo cáo và được gửi lần lượt. Bạn có thể đóng cửa sổ này");
  });

  it("done / stopped", () => {
    const done = render(applyPoll(W0, batchFixture({ done: true, counts: { PENDING: 0, SENDING: 0, SENT: 2, FAILED: 1, SKIPPED: 0 } }), 1));
    expect(done).toContain("Đã gửi xong");
    expect(done).not.toContain("Bạn có thể đóng cửa sổ này");
    // Finished with a failure: what is left and how to start a new message (the batch stays on reopening).
    expect(done).toContain("Còn 1 thư chưa gửi được");
    expect(done).toContain("cho đến khi bấm “Gửi thư khác”");
    const allSent = render(
      applyPoll(W0, batchFixture({ done: true, items: batchFixture().items.slice(0, 1), counts: { PENDING: 0, SENDING: 0, SENT: 1, FAILED: 0, SKIPPED: 0 } }), 1),
    );
    expect(allSent).toContain("Đã gửi xong");
    expect(allSent).not.toContain("chưa gửi được");
    const stopped = render(applyPollError(applyPoll(W0, batchFixture(), 1), { status: 403, message: "Bạn không có quyền." }, 2));
    expect(stopped).toContain("Đã dừng theo dõi tiến độ");
    expect(stopped).toContain("Chưa cập nhật được tiến độ: Bạn không có quyền.");
    expect(stopped).not.toContain("thư chưa gửi được");
  });
});

describe("ReportToolbar actions", () => {
  it("shows 'Tải PDF' and 'Gửi email' only when their handlers are given", () => {
    const { ds, options } = mailFixture();
    const base = {
      period: { mode: "week", key: "2026-10-19" } as const,
      periodOptions: periodOptions(ds.weeks, ds.config.semesters, FIXTURE_TODAY),
      onMode: noop,
      onPeriodKey: noop,
      recipients: options,
      recipientKey: "bgh",
      onRecipient: noop,
      detail: false,
      onDetail: noop,
      onPrint: noop,
      rows: 2,
    };
    const all = renderToStaticMarkup(createElement(ReportToolbar, { ...base, onDownloadPdf: noop, downloadingPdf: true, onSendMail: noop }));
    expect(all).toContain("In / Lưu PDF");
    expect(all).toContain("Tải PDF");
    expect(all).toContain("Gửi email");
    expect(all).toContain('aria-busy="true"');
    const none = renderToStaticMarkup(createElement(ReportToolbar, base));
    expect(none).toContain("In / Lưu PDF");
    expect(none).not.toContain("Tải PDF");
    expect(none).not.toContain("Gửi email");
  });
});
