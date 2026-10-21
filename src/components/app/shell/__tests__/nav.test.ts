import { describe, expect, it } from "vitest";
import { hasPermission, type Permission } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { activeNavItem, bottomNavModel, NAV_GROUPS, NAV_ICONS, visibleNavGroups } from "../nav-config";
import { APP_ROUTE_LIST, APP_ROUTES, canSeeRoute, isRouteActive, routeForPath, routeMetadata } from "../routes";

const ctxFor = (role: Role, levelCount: number) => ({
  can: (p: Permission) => hasPermission({ role, active: true }, p),
  levelCount,
});
const ids = (role: Role, levels: number) => visibleNavGroups(ctxFor(role, levels)).flatMap((g) => g.items.map((i) => i.id));

describe("routes", () => {
  it("covers every screen of ARCHITECTURE §7 exactly once", () => {
    const hrefs = APP_ROUTE_LIST.map((r) => r.href).sort();
    expect(hrefs).toEqual(
      ["/", "/bao-cao", "/bao-gvcn", "/cai-dat", "/diem-thuong", "/du-lieu", "/hanh-dong", "/hoc-sinh", "/lop", "/nhap-lieu", "/nhap-xuat", "/nhat-ky", "/quan-ly-hoc-sinh", "/toan-truong", "/xep-hang"].sort(),
    );
    expect(NAV_GROUPS.flatMap((g) => g.items).length).toBe(APP_ROUTE_LIST.length);
  });

  it("matches the active route by exact '/' and href prefixes", () => {
    expect(isRouteActive("/", "/")).toBe(true);
    expect(isRouteActive("/", "/xep-hang")).toBe(false);
    expect(isRouteActive("/lop", "/lop/6A01")).toBe(true);
    expect(isRouteActive("/lop", "/lophoc")).toBe(false);
    expect(routeForPath("/")?.id).toBe("overview");
    expect(routeForPath("/hoc-sinh/99060001")?.id).toBe("students");
    expect(routeForPath("/khong-ton-tai")).toBeUndefined();
  });

  it("builds route metadata titles", () => {
    expect(routeMetadata("ranking")).toEqual({ title: "Xếp hạng" });
    expect(routeMetadata("reports")).toEqual({ title: "Báo cáo tuần/tháng" });
  });

  it("declares the weekly/monthly report route (REQ_V2 §6.5)", () => {
    expect(APP_ROUTES.reports).toMatchObject({
      href: "/bao-cao",
      shortLabel: "Báo cáo",
      permission: "view.dashboard",
      filters: false,
      levelSwitcher: true,
    });
    expect(routeForPath("/bao-cao")?.id).toBe("reports");
    expect(NAV_ICONS.reports).toBeDefined();
    const overview = NAV_GROUPS.find((g) => g.id === "overview")!.items.map((i) => i.id);
    expect(overview.indexOf("reports")).toBe(overview.indexOf("gvcn") + 1);
  });

  it("opens Điểm thưởng with reward.propose (GVCN proposals, REQ_V2 §5.3)", () => {
    expect(APP_ROUTES.rewards.permission).toBe("reward.propose");
    for (const role of ["ADMIN", "EDITOR", "GVCN"] as const) expect(canSeeRoute(APP_ROUTES.rewards, ctxFor(role, 1))).toBe(true);
    expect(canSeeRoute(APP_ROUTES.rewards, ctxFor("VIEWER", 3))).toBe(false);
  });

  it("shows Toàn trường only with 2+ accessible levels", () => {
    expect(canSeeRoute(APP_ROUTES.school, ctxFor("VIEWER", 1))).toBe(false);
    expect(canSeeRoute(APP_ROUTES.school, ctxFor("VIEWER", 2))).toBe(true);
  });
});

describe("visibleNavGroups", () => {
  it("ADMIN with all levels sees everything", () => {
    expect(ids("ADMIN", 3)).toHaveLength(15);
    expect(visibleNavGroups(ctxFor("ADMIN", 3)).map((g) => g.label)).toEqual(["Tổng quan", "Ghi nhận", "Điều hành", "Quản trị"]);
  });

  it("EDITOR: dashboards + recording + actions (read) + data review", () => {
    expect(ids("EDITOR", 1)).toEqual(["overview", "ranking", "classes", "gvcn", "reports", "students", "entry", "rewards", "actions", "data"]);
  });

  it("VIEWER: dashboards + actions; GVCN: dashboards + reward proposals; empty groups dropped", () => {
    expect(ids("VIEWER", 3)).toEqual(["overview", "school", "ranking", "classes", "gvcn", "reports", "students", "actions"]);
    expect(ids("GVCN", 1)).toEqual(["overview", "ranking", "classes", "gvcn", "reports", "students", "rewards"]);
    expect(visibleNavGroups(ctxFor("GVCN", 1)).map((g) => g.id)).toEqual(["overview", "record"]);
  });

  it("an inactive profile sees nothing", () => {
    expect(visibleNavGroups({ can: () => false, levelCount: 3 })).toEqual([]);
  });
});

describe("bottomNavModel", () => {
  it("puts the gold + Nhập in the centre for users who can record incidents", () => {
    const m = bottomNavModel(ctxFor("EDITOR", 1));
    expect(m.slots.map((s) => [s.item.id, s.emphasized])).toEqual([
      ["overview", false],
      ["ranking", false],
      ["entry", true],
      ["students", false],
    ]);
    expect(m.more.flatMap((g) => g.items.map((i) => i.id))).toEqual(["classes", "gvcn", "reports", "rewards", "actions", "data"]);
  });

  it("falls back to Báo GVCN in the centre otherwise", () => {
    const m = bottomNavModel(ctxFor("GVCN", 1));
    expect(m.slots.map((s) => [s.item.id, s.emphasized])).toEqual([
      ["overview", false],
      ["ranking", false],
      ["gvcn", false],
      ["students", false],
    ]);
    expect(m.more.flatMap((g) => g.items.map((i) => i.id))).toEqual(["classes", "reports", "rewards"]);
  });
});

describe("activeNavItem", () => {
  it("prefers the longest matching href", () => {
    const items = [{ href: "/" }, { href: "/hoc-sinh" }, { href: "/quan-ly-hoc-sinh" }];
    expect(activeNavItem(items, "/quan-ly-hoc-sinh")?.href).toBe("/quan-ly-hoc-sinh");
    expect(activeNavItem(items, "/hoc-sinh/1")?.href).toBe("/hoc-sinh");
    expect(activeNavItem(items, "/")?.href).toBe("/");
    expect(activeNavItem(items, "/abc")).toBeUndefined();
  });
});
