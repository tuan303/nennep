/** "Hướng dẫn sử dụng" link (sidebar bottom + last "Thêm" tile) and the author credit line. */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hasPermission, ROLES, type Permission } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { CREDIT_TEXT, CreditLine } from "../credit-line";
import { bottomNavModel, FOOTER_NAV_ITEMS, GUIDE_NAV_ITEM, NAV_GROUPS, visibleNavGroups } from "../nav-config";
import { APP_ROUTE_LIST, GUIDE_ROUTE, guideHref, routeForPath } from "../routes";

(globalThis as { React?: typeof React }).React = React;

const ctxFor = (role: Role, levelCount: number) => ({
  can: (p: Permission) => hasPermission({ role, active: true }, p),
  levelCount,
});

describe("guide route", () => {
  it("is a public page outside the permission routes", () => {
    expect(GUIDE_ROUTE).toMatchObject({ href: "/huong-dan", title: "Hướng dẫn sử dụng" });
    expect(APP_ROUTE_LIST.some((r) => r.href === GUIDE_ROUTE.href)).toBe(false);
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === GUIDE_ROUTE.href)).toBe(false);
    expect(routeForPath("/huong-dan")).toBeUndefined();
    expect(guideHref()).toBe("/huong-dan");
    expect(guideHref("xep-hang")).toBe("/huong-dan#xep-hang");
  });
});

describe("guide link in the in-app menu", () => {
  it.each(ROLES)("%s: last item at the bottom of the sidebar and last tile of the phone 'Thêm' sheet", (role) => {
    for (const levels of [1, 3]) {
      const ctx = ctxFor(role, levels);
      // Sidebar footer (same list for every role, separate from the permission groups).
      expect(FOOTER_NAV_ITEMS.at(-1)).toBe(GUIDE_NAV_ITEM);
      expect(visibleNavGroups(ctx).flatMap((g) => g.items).some((i) => i.href === "/huong-dan")).toBe(false);
      // "Thêm" sheet: after the remaining features.
      const m = bottomNavModel(ctx);
      expect(m.extras.at(-1)).toMatchObject({ id: "guide", href: "/huong-dan", title: "Hướng dẫn sử dụng" });
      expect(m.extras.at(-1)?.icon).toBeDefined();
    }
  });

  it("is there even for a profile without any permission", () => {
    const m = bottomNavModel({ can: () => false, levelCount: 0 });
    expect(m.slots).toEqual([]);
    expect(m.more).toEqual([]);
    expect(m.extras.map((i) => i.href)).toEqual(["/huong-dan"]);
  });
});

describe("CreditLine", () => {
  it("shows the exact credit text", () => {
    expect(CREDIT_TEXT).toBe("© Designed & Developed by Tuan™");
    const html = renderToStaticMarkup(createElement(CreditLine));
    expect(html).toContain(">© Designed &amp; Developed by Tuan™<");
  });

  it("is hidden on paper unless printable", () => {
    expect(renderToStaticMarkup(createElement(CreditLine))).toContain("data-print-hide");
    expect(renderToStaticMarkup(createElement(CreditLine, { printable: true }))).not.toContain("data-print-hide");
    expect(renderToStaticMarkup(createElement(CreditLine, { tone: "onDark" }))).toContain("text-white/60");
  });
});
