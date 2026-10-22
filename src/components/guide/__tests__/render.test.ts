/**
 * Server-render smoke tests of the guide page with FICTIONAL fixture content (node environment, no DOM):
 * it must render signed out and signed in, show every block kind, demos, FAQ, glossary and the credit line.
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPermission, type Permission } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { buildGuideToc, GuideView } from "../guide-view";
import { GuideDemo, type GuideDemoKind } from "../guide-demos";
import { InlineText } from "../inline-text";
import { FIXTURE_GUIDE } from "./fixture";

(globalThis as { React?: typeof React }).React = React;

const session: { status: "loading" | "signedOut" | "signedIn"; role?: Role; email?: string } = { status: "signedOut" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  usePathname: () => "/huong-dan",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({
    status: session.status,
    email: session.email,
    profile: session.role ? { uid: "u", email: "nguoi-dung@vi-du.test", displayName: "Nguyễn Văn A", role: session.role, active: true, levels: [], gvcnClasses: [] } : undefined,
    accessibleLevels: session.role ? ["THCS"] : [],
    can: (p: Permission) => (session.role ? hasPermission({ role: session.role, active: true }, p) : false),
  }),
}));

const render = () => renderToStaticMarkup(createElement(GuideView, { content: FIXTURE_GUIDE }));

beforeEach(() => {
  session.status = "signedOut";
  session.role = undefined;
  session.email = undefined;
});

describe("GuideView (SSR smoke)", () => {
  it("renders the public page for a signed-out reader", () => {
    const html = render();
    expect(html).toContain("Hướng dẫn sử dụng");
    expect(html).toContain("Cập nhật 22/10/2026");
    expect(html).toContain('href="/dang-nhap"');
    expect(html).toContain(">Đăng nhập<");
    expect(html).not.toContain("Vào phần mềm");
    expect(html).toContain("In / Lưu PDF");
    // Groups (fixed labels), sections with anchors, role cards, quick-start steps.
    expect(html).toContain("Xem &amp; theo dõi");
    expect(html).toContain('id="xep-hang"');
    expect(html).toContain('id="bat-dau-editor"');
    expect(html).toContain("Theo dõi lớp chủ nhiệm");
    // No "Mở màn hình" shortcut without a session.
    expect(html).not.toContain("Mở màn hình");
    // FAQ accordion + glossary + credit (kept on paper).
    expect(html).toContain("data-guide-faq");
    expect(html).toContain("Điểm thưởng tính khi nào?");
    expect(html).toContain("Lượt vi phạm");
    expect(html).toContain("© Designed &amp; Developed by Tuan™");
    // Unknown related section ids are skipped.
    expect(html).not.toContain("khong-co-muc-nay");
  });

  it("renders every block kind", () => {
    const html = render();
    expect(html).toContain("Các bước"); // steps title
    expect(html).toContain("Mẹo"); // tip default title
    expect(html).toContain("Kiểm tra trước khi lưu"); // warn title
    expect(html).toContain("Lưu ý"); // note default title
    expect(html).toContain("<table"); // table (desktop)
    expect(html).toContain("Các cột chính."); // table caption
    expect(html).toContain("Minh họa · dữ liệu mẫu"); // demo frame
    expect(html).toContain("2 điểm × 3 HS ="); // formula demo
    expect(html).toContain("Top 90%");
    expect(html).toContain('data-ui-label=""'); // [[chip]]
  });

  it("adds 'Vào phần mềm' and permitted screen shortcuts for a signed-in reader", () => {
    session.status = "signedIn";
    session.role = "EDITOR";
    const html = render();
    expect(html).toContain("Vào phần mềm");
    expect(html).not.toContain(">Đăng nhập<");
    expect(html).toContain("Mở màn hình Xếp hạng");
    expect(html).toContain("Mở màn hình Nhập liệu");
    expect(html).toContain('href="/nhap-lieu?tab=su-viec"');
    expect(html).toContain("Vai trò của bạn");
  });

  it("hides shortcuts the role may not open", () => {
    session.status = "signedIn";
    session.role = "VIEWER";
    const html = render();
    expect(html).toContain("Mở màn hình Xếp hạng");
    expect(html).not.toContain("Mở màn hình Nhập liệu");
  });

  it("shows a placeholder (no wrong button) while the session is restoring", () => {
    session.status = "loading";
    expect(render()).not.toContain(">Đăng nhập<");
    session.email = "nguoi-dung@vi-du.test";
    expect(render()).toContain("Vào phần mềm");
  });

  it("builds the table of contents with FAQ inside 'Câu hỏi thường gặp' and the glossary last", () => {
    const toc = buildGuideToc(FIXTURE_GUIDE);
    expect(toc.map((n) => n.label)).toEqual(["Bắt đầu nhanh", "Xem & theo dõi", "Ghi nhận", "Câu hỏi thường gặp", "Thuật ngữ"]);
    expect(toc[3].children?.map((c) => c.id)).toEqual(["loi-thuong-gap", "cau-hoi-thuong-gap"]);
  });
});

describe("demos and inline text", () => {
  it.each<GuideDemoKind>(["kpi", "rag", "top90", "status", "datacheck", "formula", "reward-levels", "level-colors", "filters", "bottom-nav"])("renders the %s demo", (demo) => {
    const html = renderToStaticMarkup(createElement(GuideDemo, { demo }));
    expect(html.length).toBeGreaterThan(50);
  });

  it("renders chips, code, bold and links", () => {
    const html = renderToStaticMarkup(createElement(InlineText, { text: "Bấm **[[Lưu]]**, mã `L03`, xem [Xếp hạng](/xep-hang) hoặc [mục](#xep-hang)." }));
    expect(html).toContain("<strong");
    expect(html).toMatch(/<span data-ui-label="" class="[^"]*rounded-full[^"]*">Lưu<\/span>/);
    expect(html).toContain(">L03</code>");
    expect(html).toContain('href="/xep-hang"');
    expect(html).toContain('href="#xep-hang"');
  });
});
