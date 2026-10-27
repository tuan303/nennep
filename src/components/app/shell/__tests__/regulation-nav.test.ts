/**
 * Quy chế khen thưởng / kỷ luật in the shell: routes, top-bar buttons (≥ 1024px) and "Quy chế" menu (below), "Thêm"
 * tiles before the guide – for EVERY signed-in role, never in the permission-filtered sidebar. SSR renders (no DOM).
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { hasPermission, ROLES, type Permission } from "@/lib/constants";
import type { LevelId, Role, UserProfile } from "@/lib/types";

const nav = vi.hoisted(() => ({ pathname: "/hanh-dong" }));
const who = vi.hoisted(() => ({ role: "VIEWER" as string, levels: [] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/client/data", () => ({
  useLevel: () => ({ levelId: "THCS", setLevelId: () => undefined, accessibleLevels: ["TH", "THCS", "THPT"] }),
  useDataset: () => ({ refresh: async () => undefined, refreshing: false }),
  useDatasetVersion: () => 3,
  useSyncStatus: () => ({ refreshing: false, live: true, lastSyncedAt: undefined, error: undefined }),
}));

vi.mock("@/lib/client/session", async () => {
  const { hasPermission: can } = await import("@/lib/constants");
  const profile = () =>
    ({
      uid: "u1",
      email: "nguoi.dung@nshm.test",
      displayName: "Người Dùng Thử",
      role: who.role,
      levels: who.levels,
      gvcnClasses: [],
      active: true,
      createdAt: "2026-08-01T00:00:00Z",
    }) as unknown as UserProfile;
  return {
    useSession: () => ({
      status: "signedIn",
      profile: profile(),
      email: profile().email,
      accessibleLevels: ["TH", "THCS", "THPT"],
      can: (p: Permission) => can(profile(), p),
      logout: async () => undefined,
    }),
  };
});

const { bottomNavModel, REGULATION_ICONS, REGULATION_NAV_ITEMS, visibleNavGroups } = await import("../nav-config");
const { APP_ROUTE_LIST, REGULATION_ROUTES, isRegulationId, regulationHref, regulationIdForPath, routeForPath } = await import("../routes");
const { RegulationLinks, RegulationMenu } = await import("../regulation-links");
const { TopBar } = await import("../top-bar");
const { ShellProvider } = await import("../shell-context");

const ctxFor = (role: Role, levelCount: number, levels: LevelId[] = []) => ({
  can: (p: Permission) => hasPermission({ role, active: true, levels }, p),
  levelCount,
});

function topBar(role: Role, levels: LevelId[] = [], pathname = "/hanh-dong"): string {
  who.role = role;
  who.levels = levels;
  nav.pathname = pathname;
  return renderToStaticMarkup(h(ShellProvider, null, h(TopBar)));
}

describe("regulation routes", () => {
  it("declares /quy-che/khen-thuong and /quy-che/ky-luat outside the permission routes", () => {
    expect(REGULATION_ROUTES.map((r) => [r.id, r.href, r.title, r.shortLabel])).toEqual([
      ["quy-che-khen-thuong", "/quy-che/khen-thuong", "Quy chế khen thưởng", "Khen thưởng"],
      ["quy-che-ky-luat", "/quy-che/ky-luat", "Quy chế kỷ luật", "Kỷ luật"],
    ]);
    expect(APP_ROUTE_LIST.some((r) => r.href.startsWith("/quy-che"))).toBe(false);
    expect(routeForPath("/quy-che/ky-luat")).toBeUndefined();
    expect(regulationHref("ky-luat", "dieu-5")).toBe("/quy-che/ky-luat#dieu-5");
  });

  it("recognises the regulation of a path and rejects unknown ids", () => {
    expect(regulationIdForPath("/quy-che/khen-thuong")).toBe("khen-thuong");
    expect(regulationIdForPath("/quy-che/ky-luat/")).toBe("ky-luat");
    expect(regulationIdForPath("/quy-che/khac")).toBeUndefined();
    expect(regulationIdForPath("/quy-che")).toBeUndefined();
    expect(regulationIdForPath("/xep-hang")).toBeUndefined();
    expect(isRegulationId("ky-luat")).toBe(true);
    expect(isRegulationId("KY-LUAT")).toBe(false);
    expect(isRegulationId(undefined)).toBe(false);
  });

  it("uses an Award icon for khen thưởng and a Scale icon for kỷ luật", () => {
    expect(REGULATION_NAV_ITEMS.map((i) => i.icon)).toEqual([REGULATION_ICONS["khen-thuong"], REGULATION_ICONS["ky-luat"]]);
    expect(REGULATION_ICONS["khen-thuong"]).not.toBe(REGULATION_ICONS["ky-luat"]);
  });
});

describe("regulation entries for every role", () => {
  const cases: Array<[Role, number, LevelId[]]> = [
    ...ROLES.flatMap((r): Array<[Role, number, LevelId[]]> => [
      [r, 1, []],
      [r, 3, []],
    ]),
    ["ADMIN", 1, ["THCS"]],
  ];

  it.each(cases)("%s (%i level(s), restricted to %j): 'Thêm' tiles before the guide, never in the sidebar", (role, count, levels) => {
    const ctx = ctxFor(role, count, levels);
    const m = bottomNavModel(ctx);
    expect(m.extras.map((i) => i.href)).toEqual(["/quy-che/khen-thuong", "/quy-che/ky-luat", "/huong-dan"]);
    expect(visibleNavGroups(ctx).flatMap((g) => g.items).some((i) => i.href.startsWith("/quy-che"))).toBe(false);
  });

  it.each(ROLES)("%s: top bar shows both buttons (≥ 1024px) and the 'Quy chế' menu button (640–1023px)", (role) => {
    const html = topBar(role);
    expect(html).toContain('aria-label="Quy chế của trường"');
    expect(html).toContain('href="/quy-che/khen-thuong"');
    expect(html).toContain('href="/quy-che/ky-luat"');
    expect(html).toContain('aria-label="Quy chế khen thưởng"');
    expect(html).toContain('aria-label="Quy chế kỷ luật"');
    expect(html).toContain('aria-label="Quy chế"');
    expect(html).not.toContain('aria-current="page"');
  });

  it("a level-limited admin sees them too", () => {
    expect(topBar("ADMIN", ["THPT"])).toContain('href="/quy-che/ky-luat"');
  });

  it("on a quy chế page: the title, no level switcher, the current button pressed", () => {
    const html = topBar("GVCN", [], "/quy-che/ky-luat");
    expect(html).toContain("Quy chế kỷ luật</p>");
    expect(html).not.toContain('aria-label="Cấp học"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/quy-che\/ky-luat"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/quy-che\/ky-luat"/);
    // Other pages keep their level switcher.
    expect(topBar("GVCN", [], "/hanh-dong")).toContain('aria-label="Cấp học"');
  });
});

describe("RegulationLinks / RegulationMenu", () => {
  it("label by bar width: icon only, short label, then the full title (accessible name = full title)", () => {
    const html = renderToStaticMarkup(h(RegulationLinks, { pathname: "/quy-che/khen-thuong", className: "hidden lg:flex" }));
    expect(html).toContain("hidden lg:flex");
    expect(html).toContain(">Khen thưởng</span>");
    expect(html).toContain(">Quy chế khen thưởng</span>");
    expect(html).toContain(">Kỷ luật</span>");
    expect(html).toContain("@min-[860px]:inline");
    expect(html).toContain("@min-[1000px]:inline");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("menu trigger is an icon button labelled 'Quy chế'", () => {
    const html = renderToStaticMarkup(h(RegulationMenu, { pathname: "/", className: "hidden sm:inline-flex lg:hidden" }));
    expect(html).toContain('aria-label="Quy chế"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("sm:inline-flex");
  });
});
