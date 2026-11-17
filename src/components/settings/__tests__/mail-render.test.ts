/**
 * SSR smoke tests of Cài đặt → Email: the cards with fictional data (no provider needed), the tab registration and
 * the whole screen on `?tab=email` (effects do not run in SSR: the tab shows its loading state).
 */
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MailStatus } from "@/lib/contract";
import type { MailSettings } from "@/lib/types";

(globalThis as { React?: typeof React }).React = React;

const nav = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  usePathname: () => "/cai-dat",
}));

vi.mock("@/lib/client/data", async () => {
  const { makeFixtureDataset } = await import("@/lib/engine/__fixtures__/dataset");
  const ds = makeFixtureDataset();
  return {
    useLevel: () => ({ levelId: "THCS", setLevelId: () => undefined, accessibleLevels: ["THCS"] }),
    useDataset: () => ({ levelId: "THCS", dataset: ds, status: "ready", refreshing: false, refresh: async () => undefined }),
  };
});

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({
    status: "signedIn",
    profile: { uid: "admin", email: "admin@example.edu.vn", displayName: "Quản trị", role: "ADMIN", levels: [], gvcnClasses: [], active: true, createdAt: "2026-08-01T00:00:00Z" },
    accessibleLevels: ["THCS"],
    can: () => true,
    canSeeClass: () => true,
    reloadProfile: async () => undefined,
  }),
}));

const { ConnectionCard } = await import("../mail/connection-card");
const { NoticesCard } = await import("../mail/notices-card");
const { RecipientsCard } = await import("../mail/recipients-card");
const { DomainsCard } = await import("../mail/domains-card");
const { EmailListField } = await import("../mail/email-list-field");
const { MailLogCard } = await import("../mail/mail-log-card");
const { mailDraft, validateMailDraft, withMailList } = await import("../mail/lib/mail-form");
const { SETTINGS_TABS, resolveTab, settingsTabHref, visibleTabs } = await import("../lib/tabs");
const { SettingsScreen } = await import("../settings-screen");

const noop = () => undefined;

const configured: MailStatus = {
  configured: true,
  sender: "nennep@example.edu.vn",
  senderName: "Nền nếp NSHM",
  allowedDomains: ["example.edu.vn"],
  baseUrl: "https://nennep.example.edu.vn",
  missing: [],
};
const notConfigured: MailStatus = { configured: false, allowedDomains: [], baseUrl: "http://localhost:3000", missing: ["MS_GRAPH_TENANT_ID", "MAIL_SENDER"] };

const settings: MailSettings = {
  levelId: "THCS",
  notices: { enabled: true, incidents: false, rewards: false },
  report: { bgh: ["bgh@example.edu.vn"], grades: {}, cc: [] },
  allowedDomains: [],
  rev: 1,
};

describe("Cài đặt → Email (SSR smoke)", () => {
  it("registers the Email tab (settings.manage, per level, alias mail)", () => {
    const def = SETTINGS_TABS.find((t) => t.id === "email");
    expect(def).toMatchObject({ label: "Email", permission: "settings.manage", perLevel: true });
    const all = visibleTabs(() => true);
    expect(resolveTab("mail", all)).toBe("email");
    expect(resolveTab("email", all)).toBe("email");
    expect(resolveTab("email", visibleTabs((p) => p !== "settings.manage"))).not.toBe("email");
    expect(settingsTabHref("email")).toBe("/cai-dat?tab=email");
  });

  it("shows the connection status without any secret", () => {
    const ok = renderToStaticMarkup(h(ConnectionCard, { status: configured, userEmail: "admin@example.edu.vn", testing: false, onTest: noop }));
    expect(ok).toContain("Đã cấu hình");
    expect(ok).toContain("nennep@example.edu.vn");
    expect(ok).toContain("Gửi thư thử tới tôi");
    expect(ok).toContain('href="/huong-dan#thiet-lap-email"');
    expect(ok).toContain("Thư thử được gửi ngay tới admin@example.edu.vn");
    const missing = renderToStaticMarkup(h(ConnectionCard, { status: notConfigured, testing: false, onTest: noop }));
    expect(missing).toContain("Chưa cấu hình");
    expect(missing).toContain("MS_GRAPH_TENANT_ID");
    expect(missing).toContain("Environment Variables");
    expect(missing).toMatch(/<button[^>]*disabled=""[^>]*>.*Gửi thư thử tới tôi/);
  });

  it("renders the notices card with its warning and GVCN coverage", () => {
    const html = renderToStaticMarkup(
      h(NoticesCard, {
        notices: settings.notices,
        onChange: noop,
        configured: true,
        coverage: {
          status: "ready",
          classes: [
            { classCode: "6A01", grade: 6, recipients: ["gv.6a01@example.edu.vn"], missing: false },
            { classCode: "6A02", grade: 6, recipients: [], missing: true },
          ],
          domainsKnown: true,
        },
        onRetryCoverage: noop,
        onOpenClasses: noop,
        disabled: false,
      }),
    );
    expect(html).toContain("Gửi thông báo cho GVCN");
    expect(html).toContain("Khi trừ điểm (sự việc)");
    expect(html).toContain("Khi cộng điểm (điểm thưởng)");
    expect(html).toContain("chưa chọn loại thông báo");
    expect(html).toContain("1/2 lớp");
    expect(html).toContain("6A02");
    expect(html).toContain("Mở Cài đặt → Lớp &amp; GVCN");
  });

  it("no allowed domain known at all: a neutral coverage note instead of every class missing an email", () => {
    const html = renderToStaticMarkup(
      h(NoticesCard, {
        notices: settings.notices,
        onChange: noop,
        configured: false,
        coverage: {
          status: "ready",
          classes: [
            { classCode: "6A01", grade: 6, recipients: [], missing: true },
            { classCode: "6A02", grade: 6, recipients: [], missing: true },
          ],
          domainsKnown: false,
        },
        onRetryCoverage: noop,
        onOpenClasses: noop,
        disabled: false,
      }),
    );
    expect(html).toContain("Chưa xác định tên miền nhận thư");
    expect(html).toContain("Chưa kiểm tra được email GVCN");
    expect(html).not.toContain("0/2 lớp");
    expect(html).not.toContain("Chưa có email GVCN");
    expect(html).not.toContain("6A01");
    expect(html).not.toContain("Mở Cài đặt → Lớp &amp; GVCN");
  });

  it("renders the recipient lists with invalid and blocked addresses highlighted", () => {
    const draft = withMailList(mailDraft(settings, "THCS"), "cc", ["vp@other.vn", "sai@"]);
    const html = renderToStaticMarkup(
      h(RecipientsCard, { levelId: "THCS", draft, errors: validateMailDraft(draft, "THCS"), domains: ["example.edu.vn"], onListChange: noop, onOpenClasses: noop, disabled: false }),
    );
    for (const label of ["Ban Giám hiệu", "Tổ khối 6", "Tổ khối 9", "Luôn gửi kèm (CC)"]) expect(html).toContain(label);
    expect(html).toContain("bgh@example.edu.vn");
    expect(html).toContain("Địa chỉ email không hợp lệ: sai@.");
    expect(html).toContain("(không hợp lệ)");
    expect(html).toContain("(ngoài tên miền được phép)");
    expect(html).toContain("thư sẽ không gửi tới:");
    expect(html).toContain('aria-invalid="true"');
    // Nothing near the per-email limit: no limit warning.
    expect(html).not.toContain("data-recipient-limit");
  });

  it("warns (without an error) when a list plus CC exceeds the per-email recipient limit", () => {
    const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}@example.edu.vn`);
    const draft = withMailList(withMailList(mailDraft(settings, "THCS"), "grade-7", many("tk7-", 10)), "cc", many("vp", 45));
    const errors = validateMailDraft(draft, "THCS");
    expect(errors).toEqual({});
    const html = renderToStaticMarkup(
      h(RecipientsCard, { levelId: "THCS", draft, errors, domains: ["example.edu.vn"], onListChange: noop, onOpenClasses: noop, disabled: false }),
    );
    // Tổ khối 7: 10 + 45 = 55; BGH: 1 + 45 = 46 is fine.
    expect(html).toContain("Thư báo cáo Tổ khối 7 sẽ có 55 người nhận (kể cả CC), quá giới hạn 50 người nhận mỗi thư nên sẽ không gửi được.");
    expect(html).toContain("Cộng với danh sách này, thư báo cáo Tổ khối 7 vượt giới hạn 50 người nhận mỗi thư");
    expect(html).not.toContain("Thư báo cáo Ban Giám hiệu sẽ có");
    expect(html.split("data-recipient-limit").length - 1).toBe(2);
    // The list's own hint is still shown, and nothing is marked invalid.
    expect(html).toContain("Nhận báo cáo Tổ khối 7.");
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("renders the domains card with the sender's domain as placeholder", () => {
    const html = renderToStaticMarkup(h(DomainsCard, { domains: [], onChange: noop, effective: ["example.edu.vn"], senderDomain: "example.edu.vn", disabled: false }));
    expect(html).toContain('placeholder="example.edu.vn"');
    expect(html).toContain("Thư chỉ gửi tới các địa chỉ thuộc các tên miền này");
    expect(html).toContain("Đang áp dụng:");
    const typed = renderToStaticMarkup(h(DomainsCard, { domains: ["a.example.vn", "sai"], onChange: noop, effective: [], senderDomain: "", error: "Tên miền không hợp lệ: sai", disabled: false }));
    expect(typed).toContain('value="a.example.vn, sai"');
    expect(typed).toContain("chưa xác định");
  });

  it("renders an empty address list and the log card in its loading state", () => {
    const field = renderToStaticMarkup(h(EmailListField, { label: "Ban Giám hiệu", values: [], onChange: noop, placeholder: "Nhập hoặc dán địa chỉ email…" }));
    expect(field).toContain("0/50");
    expect(field).toContain('placeholder="Nhập hoặc dán địa chỉ email…"');
    const log = renderToStaticMarkup(h(MailLogCard, { levelId: "THCS", reloadSignal: 0 }));
    expect(log).toContain("Nhật ký gửi thư");
    expect(log).toContain("Làm mới");
  });

  it("renders the settings screen on ?tab=email", () => {
    nav.query = "tab=email";
    const html = renderToStaticMarkup(h(SettingsScreen));
    expect(html).toContain("Email");
    expect(html).toContain("Kết nối gửi thư, thông báo cho GVCN");
    expect(html).toContain("Đang tải cài đặt email…");
    expect(html).toContain("Nhật ký gửi thư");
  });
});
