/**
 * SSR smoke test of the whole Cài đặt screen, one render per tab (`?tab=`), with the session / dataset /
 * navigation hooks mocked by the THCS fixture. Effects do not run in SSR (the users list stays in its loading state).
 */
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
  const levels = ["TH", "THCS", "THPT"];
  return {
    useLevel: () => ({ levelId: "THCS", setLevelId: () => undefined, accessibleLevels: levels }),
    useDataset: () => ({ levelId: "THCS", dataset: ds, status: "ready", refreshing: false, refresh: async () => undefined }),
  };
});

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({
    status: "signedIn",
    profile: {
      uid: "admin",
      email: "admin@nshm.test",
      displayName: "Quản trị",
      role: "ADMIN",
      levels: [],
      gvcnClasses: [],
      active: true,
      createdAt: "2026-08-01T00:00:00Z",
    },
    accessibleLevels: ["TH", "THCS", "THPT"],
    can: () => true,
    canSeeClass: () => true,
    reloadProfile: async () => undefined,
  }),
}));

const { SettingsScreen } = await import("../settings-screen");

function renderTab(tab: string): string {
  nav.query = `tab=${tab}`;
  return renderToStaticMarkup(h(SettingsScreen));
}

describe("Cài đặt screen (SSR smoke)", () => {
  it("renders the tab list and the config tab by default", () => {
    nav.query = "";
    const html = renderToStaticMarkup(h(SettingsScreen));
    for (const label of ["Cấu hình thi đua", "Cảnh báo sớm", "Danh mục lỗi", "Lớp &amp; GVCN", "Lịch tuần", "Người dùng", "Bảo trì"]) expect(html).toContain(label);
    expect(html).toContain("Năm học &amp; điểm nền");
    expect(html).toContain("Áp dụng: Trung học cơ sở");
  });

  it("renders the early-warning tab with its live preview", () => {
    const html = renderTab("canh-bao");
    expect(html).toContain("Lớp tăng lỗi");
    expect(html).toContain("Lỗi kéo dài");
    expect(html).toContain("Sự việc nghiêm trọng");
    expect(html).toContain("Nhóm lỗi nghiêm trọng");
    expect(html).toContain("Với ngưỡng này:");
    expect(html).toContain("cảnh báo trong tuần hiện tại");
    expect(html).toContain("Mở Cấu hình thi đua → Cảnh báo học sinh");
  });

  it("renders the catalog tab", () => {
    const html = renderTab("danh-muc");
    expect(html).toContain("Thay đổi chỉ áp dụng cho sự việc ghi nhận sau");
    expect(html).toContain("Bạo lực học đường dưới mọi hình thức");
  });

  it("renders the classes tab", () => {
    const html = renderTab("lop");
    expect(html).toContain("Lê Văn Hùng");
    expect(html).toContain("Ngừng hoạt động");
  });

  it("renders the weeks tab with the current week highlighted", () => {
    const html = renderTab("lich-tuan");
    expect(html).toContain("Tuần 19/10 – 25/10/2026");
    expect(html).toContain("Không tính thi đua");
    expect(html).toContain("Tạo lại từ cấu hình");
  });

  it("renders the users tab (school-wide) and the maintenance tab", () => {
    const users = renderTab("users");
    expect(users).toContain("Áp dụng toàn trường");
    expect(users).toContain("Tạo tài khoản GVCN hàng loạt");
    const maint = renderTab("bao-tri");
    expect(maint).toContain("Tính lại dữ liệu tổng hợp");
    expect(maint).toContain("Xóa dữ liệu thử nghiệm của cấp");
    expect(maint).toContain("Khôi phục lần xóa");
  });
});
