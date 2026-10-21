import { describe, expect, it } from "vitest";
import { hasPermission, type Permission } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { activeNavItem, bottomNavModel, NAV_GROUPS, visibleNavGroups } from "../nav-config";
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
      ["/", "/bao-gvcn", "/cai-dat", "/diem-thuong", "/du-lieu", "/hanh-dong", "/hoc-sinh", "/lop", "/nhap-lieu", "/nhap-xuat", "/nhat-ky", "/quan-ly-hoc-sinh", "/toan-truong", "/xep-hang"].sort(),
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
  });

  it("shows Toàn trường only with 2+ accessible levels", () => {
    expect(canSeeRoute(APP_ROUTES.school, ctxFor("VIEWER", 1))).toBe(false);
    expect(canSeeRoute(APP_ROUTES.school, ctxFor("VIEWER", 2))).toBe(true);
  });
});

describe("visibleNavGroups", () => {
  it("ADMIN with all levels sees everything", () => {
    expect(ids("ADMIN", 3)).toHaveLength(14);
    expect(visibleNavGroups(ctxFor("ADMIN", 3)).map((g) => g.label)).toEqual(["Tổng quan", "Ghi nhận", "Điều hành", "Quản trị"]);
  });

  it("EDITOR: dashboards + recording + actions (read) + data review", () => {
    expect(ids("EDITOR", 1)).toEqual(["overview", "ranking", "classes", "gvcn", "students", "entry", "rewards", "actions", "data"]);
  });

  it("VIEWER: dashboards + actions; GVCN: dashboards only; empty groups dropped", () => {
    expect(ids("VIEWER", 3)).toEqual(["overview", "school", "ranking", "classes", "gvcn", "students", "actions"]);
    expect(ids("GVCN", 1)).toEqual(["overview", "ranking", "classes", "gvcn", "students"]);
    expect(visibleNavGroups(ctxFor("GVCN", 1)).map((g) => g.id)).toEqual(["overview"]);
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
    expect(m.more.flatMap((g) => g.items.map((i) => i.id))).toEqual(["classes", "gvcn", "rewards", "actions", "data"]);
  });

  it("falls back to Báo GVCN in the centre otherwise", () => {
    const m = bottomNavModel(ctxFor("GVCN", 1));
    expect(m.slots.map((s) => [s.item.id, s.emphasized])).toEqual([
      ["overview", false],
      ["ranking", false],
      ["gvcn", false],
      ["students", false],
    ]);
    expect(m.more.flatMap((g) => g.items.map((i) => i.id))).toEqual(["classes"]);
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
