/**
 * Navigation model: sidebar groups, bottom tab bar slots and the "Thêm" sheet.
 * Pure (icons are plain component references) – unit-tested in __tests__/nav.test.ts.
 */
import {
  Award,
  BookOpen,
  ClipboardList,
  ClipboardPen,
  Database,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Layers,
  ListChecks,
  School,
  ScrollText,
  Settings,
  Trophy,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { APP_ROUTES, GUIDE_ROUTE, canSeeRoute, isRouteActive, type AppRoute, type AppRouteId, type RouteAccessContext } from "./routes";

export interface NavItem extends AppRoute {
  icon: LucideIcon;
}

/** Link outside the permission groups, shown to every signed-in user (e.g. the user guide). */
export interface FooterNavItem {
  id: typeof GUIDE_ROUTE.id;
  href: string;
  title: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

export const GUIDE_NAV_ITEM: FooterNavItem = { ...GUIDE_ROUTE, icon: BookOpen };

/**
 * Bottom of the desktop sidebar and last tiles of the phone "Thêm" sheet – the same for every role
 * (no permission: the guide is public).
 */
export const FOOTER_NAV_ITEMS: readonly FooterNavItem[] = [GUIDE_NAV_ITEM];

export interface NavGroup {
  id: "overview" | "record" | "operate" | "admin";
  label: string;
  items: NavItem[];
}

export const NAV_ICONS: Record<AppRouteId, LucideIcon> = {
  overview: LayoutDashboard,
  school: School,
  ranking: Trophy,
  classes: Layers,
  gvcn: ClipboardList,
  reports: FileText,
  students: Users,
  entry: ClipboardPen,
  rewards: Award,
  actions: ListChecks,
  studentAdmin: UserCog,
  data: Database,
  excel: FileSpreadsheet,
  audit: ScrollText,
  settings: Settings,
};

function item(id: AppRouteId): NavItem {
  return { ...APP_ROUTES[id], icon: NAV_ICONS[id] };
}

/** Full sidebar structure (before permission filtering), in display order. */
export const NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: "Tổng quan", items: [item("overview"), item("school"), item("ranking"), item("classes"), item("gvcn"), item("reports"), item("students")] },
  { id: "record", label: "Ghi nhận", items: [item("entry"), item("rewards")] },
  { id: "operate", label: "Điều hành", items: [item("actions")] },
  { id: "admin", label: "Quản trị", items: [item("studentAdmin"), item("data"), item("excel"), item("audit"), item("settings")] },
];

/** Groups with only the items the user may open; empty groups are dropped. */
export function visibleNavGroups(ctx: RouteAccessContext): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSeeRoute(i, ctx)) })).filter((g) => g.items.length > 0);
}

export interface BottomSlot {
  item: NavItem;
  /** Big gold round "+" button in the middle of the tab bar. */
  emphasized: boolean;
}

export interface BottomNavModel {
  /** Up to 4 tabs: Tổng quan · Xếp hạng · (+ Nhập | Báo GVCN) · Học sinh. The 5th tab ("Thêm") opens `more`. */
  slots: BottomSlot[];
  /** Remaining permitted items, grouped like the sidebar (for the "Thêm" sheet). */
  more: NavGroup[];
  /** Always-available links appended after `more` in the "Thêm" sheet (Hướng dẫn sử dụng). */
  extras: FooterNavItem[];
}

/**
 * Bottom tab bar (< 768px): Tổng quan, Xếp hạng, centre slot, Học sinh, Thêm.
 * Centre slot = gold "+ Nhập" when the user can create incidents, otherwise "Báo GVCN".
 */
export function bottomNavModel(ctx: RouteAccessContext): BottomNavModel {
  const groups = visibleNavGroups(ctx);
  const visible = new Map(groups.flatMap((g) => g.items).map((i) => [i.id, i] as const));
  const centerId: AppRouteId = visible.has("entry") ? "entry" : "gvcn";
  const order: AppRouteId[] = ["overview", "ranking", centerId, "students"];
  const slots: BottomSlot[] = [];
  for (const id of order) {
    const it = visible.get(id);
    if (it) slots.push({ item: it, emphasized: id === "entry" });
  }
  const taken = new Set(slots.map((s) => s.item.id));
  const more = groups.map((g) => ({ ...g, items: g.items.filter((i) => !taken.has(i.id)) })).filter((g) => g.items.length > 0);
  return { slots, more, extras: [...FOOTER_NAV_ITEMS] };
}

/** The nav item owning `pathname` among `items` (longest href match). */
export function activeNavItem<T extends { href: string }>(items: readonly T[], pathname: string): T | undefined {
  let best: T | undefined;
  for (const it of items) {
    if (isRouteActive(it.href, pathname) && (!best || it.href.length > best.href.length)) best = it;
  }
  return best;
}
