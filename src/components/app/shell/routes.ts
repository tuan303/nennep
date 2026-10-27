/**
 * App routes (ARCHITECTURE §7): titles, permissions and shell defaults.
 * Pure module (no React, no icons) – safe to import from server components (route `metadata`) and tests.
 */
import type { Metadata } from "next";
import { REGULATION_IDS, REGULATION_LABELS, type Permission } from "@/lib/constants";
import type { RegulationId } from "@/lib/types";

export type AppRouteId =
  | "overview"
  | "school"
  | "ranking"
  | "classes"
  | "gvcn"
  | "reports"
  | "students"
  | "entry"
  | "rewards"
  | "actions"
  | "studentAdmin"
  | "data"
  | "excel"
  | "audit"
  | "settings";

export interface AppRoute {
  id: AppRouteId;
  href: string;
  /** Page title (top bar, browser tab, nav label). */
  title: string;
  /** Shorter label for the bottom tab bar. */
  shortLabel: string;
  /** One-line Vietnamese description (placeholders, "Thêm" sheet). */
  description: string;
  /** Minimum permission to open the page (constants.ts). */
  permission: Permission;
  /** Only for users who can access more than one level (Toàn trường). */
  multiLevel?: boolean;
  /** The global filter bar is shown by default on this page (override with useShellOptions). */
  filters: boolean;
  /** The level switcher is shown by default on this page. */
  levelSwitcher: boolean;
}

export const APP_ROUTES: Record<AppRouteId, AppRoute> = {
  overview: {
    id: "overview",
    href: "/",
    title: "Tổng quan",
    shortLabel: "Tổng quan",
    description: "Bức tranh nền nếp của cấp học: chỉ số chính, xu hướng, vấn đề nổi bật và lớp cần ưu tiên.",
    permission: "view.dashboard",
    filters: true,
    levelSwitcher: true,
  },
  school: {
    id: "school",
    href: "/toan-truong",
    title: "Toàn trường",
    shortLabel: "Toàn trường",
    description: "So sánh nền nếp giữa các cấp học trong toàn trường.",
    permission: "view.dashboard",
    multiLevel: true,
    filters: false,
    levelSwitcher: false,
  },
  ranking: {
    id: "ranking",
    href: "/xep-hang",
    title: "Xếp hạng",
    shortLabel: "Xếp hạng",
    description: "Bảng xếp hạng thi đua theo khối (THPT: toàn cấp): điểm nền, điểm thưởng, điểm trừ và nhóm Top của từng lớp.",
    permission: "view.dashboard",
    filters: true,
    levelSwitcher: true,
  },
  classes: {
    id: "classes",
    href: "/lop",
    title: "Khối & lớp",
    shortLabel: "Lớp",
    description: "Chi tiết từng lớp: chỉ số, thứ hạng (trong khối; THPT: toàn cấp), xu hướng và diễn biến theo ngày.",
    permission: "view.dashboard",
    filters: true,
    levelSwitcher: true,
  },
  gvcn: {
    id: "gvcn",
    href: "/bao-gvcn",
    title: "Báo GVCN",
    shortLabel: "Báo GVCN",
    description: "Báo cáo nền nếp gửi giáo viên chủ nhiệm, kèm phản hồi của GVCN.",
    permission: "view.dashboard",
    filters: true,
    levelSwitcher: true,
  },
  reports: {
    id: "reports",
    href: "/bao-cao",
    title: "Báo cáo tuần/tháng",
    shortLabel: "Báo cáo",
    description: "Báo cáo nền nếp theo tuần hoặc tháng gửi BGH, tổ khối hoặc GVCN: in, lưu PDF và xuất Excel chi tiết.",
    permission: "view.dashboard",
    filters: false,
    levelSwitcher: true,
  },
  students: {
    id: "students",
    href: "/hoc-sinh",
    title: "Học sinh",
    shortLabel: "Học sinh",
    description: "Học sinh liên quan đến sự việc, số lượt, điểm trừ và cảnh báo tái phạm.",
    permission: "view.dashboard",
    filters: true,
    levelSwitcher: true,
  },
  entry: {
    id: "entry",
    href: "/nhap-lieu",
    title: "Nhập liệu",
    shortLabel: "Nhập",
    description: "Ghi nhận sự việc nền nếp nhanh chóng, kèm minh chứng.",
    permission: "incident.create",
    filters: false,
    levelSwitcher: true,
  },
  rewards: {
    id: "rewards",
    href: "/diem-thuong",
    title: "Điểm thưởng",
    shortLabel: "Thưởng",
    description: "Ghi nhận và xác minh điểm thưởng cho tập thể lớp; GVCN đề xuất điểm thưởng cho lớp chủ nhiệm.",
    // REQ_V2 §5.3: GVCN hold reward.propose (proposals for own classes); ADMIN / EDITOR hold it too.
    permission: "reward.propose",
    filters: false,
    levelSwitcher: true,
  },
  actions: {
    id: "actions",
    href: "/hanh-dong",
    title: "Hành động",
    shortLabel: "Hành động",
    description: "Danh sách hành động cải thiện, tóm tắt quyết định và theo dõi thời hạn xử lý.",
    permission: "actions.view",
    filters: false,
    levelSwitcher: true,
  },
  studentAdmin: {
    id: "studentAdmin",
    href: "/quan-ly-hoc-sinh",
    title: "Quản lý học sinh",
    shortLabel: "Quản lý HS",
    description: "Hồ sơ học sinh: tuyển mới, chuyển lớp, chuyển trường và nhập danh sách từ Excel.",
    permission: "students.manage",
    filters: false,
    levelSwitcher: true,
  },
  data: {
    id: "data",
    href: "/du-lieu",
    title: "Dữ liệu & rà soát",
    shortLabel: "Dữ liệu",
    description: "Toàn bộ sự việc, hàng đợi rà soát chất lượng dữ liệu và các mục đã xóa.",
    permission: "data.inspect",
    filters: true,
    levelSwitcher: true,
  },
  excel: {
    id: "excel",
    href: "/nhap-xuat",
    title: "Nhập/Xuất Excel",
    shortLabel: "Excel",
    description: "Nhập sổ nền nếp từ Excel, xuất báo cáo và bản chụp HTML.",
    permission: "excel.import",
    filters: false,
    levelSwitcher: true,
  },
  audit: {
    id: "audit",
    href: "/nhat-ky",
    title: "Nhật ký",
    shortLabel: "Nhật ký",
    description: "Nhật ký thao tác của người dùng trên hệ thống.",
    permission: "audit.view",
    filters: false,
    levelSwitcher: false,
  },
  settings: {
    id: "settings",
    href: "/cai-dat",
    title: "Cài đặt",
    shortLabel: "Cài đặt",
    description: "Cấu hình cấp học, danh mục lỗi, lớp & GVCN, lịch tuần và người dùng.",
    permission: "settings.manage",
    filters: false,
    levelSwitcher: true,
  },
};

export const APP_ROUTE_LIST: AppRoute[] = Object.values(APP_ROUTES);

/**
 * Public user guide (src/app/huong-dan): outside the signed-in shell, no permission, no dataset.
 * Not an AppRoute – it is linked from the login page, the bottom of the sidebar and the last "Thêm" tile.
 */
export const GUIDE_ROUTE = {
  id: "guide",
  href: "/huong-dan",
  title: "Hướng dẫn sử dụng",
  shortLabel: "Hướng dẫn",
  description: "Cách dùng từng màn hình, quy tắc tính điểm và câu hỏi thường gặp.",
} as const;

/** Link to the guide, optionally to one section: guideHref("xep-hang") → "/huong-dan#xep-hang". */
export function guideHref(sectionId?: string): string {
  return sectionId ? `${GUIDE_ROUTE.href}#${encodeURIComponent(sectionId)}` : GUIDE_ROUTE.href;
}

/**
 * Quy chế khen thưởng / kỷ luật (src/app/(app)/quy-che/[id]): school-wide documents for EVERY signed-in user, so not
 * AppRoutes (no permission, not in the sidebar). Linked from the top bar (two buttons from 1024px, a "Quy chế" menu
 * below) and from tiles of the phone "Thêm" sheet, before the guide.
 */
export interface RegulationRoute {
  id: `quy-che-${RegulationId}`;
  regulationId: RegulationId;
  href: string;
  title: string;
  shortLabel: string;
  description: string;
}

export const REGULATION_ROUTE_BASE = "/quy-che";

const REGULATION_DESCRIPTIONS: Record<RegulationId, string> = {
  "khen-thuong": "Quy chế khen thưởng học sinh của nhà trường – áp dụng cho mọi cấp học.",
  "ky-luat": "Quy chế kỷ luật học sinh của nhà trường – áp dụng cho mọi cấp học.",
};

/** "/quy-che/khen-thuong", optionally to one article: regulationHref("ky-luat", "dieu-5") → "/quy-che/ky-luat#dieu-5". */
export function regulationHref(id: RegulationId, anchor?: string): string {
  const href = `${REGULATION_ROUTE_BASE}/${id}`;
  return anchor ? `${href}#${encodeURIComponent(anchor)}` : href;
}

export const REGULATION_ROUTES: readonly RegulationRoute[] = REGULATION_IDS.map((id) => ({
  id: `quy-che-${id}` as const,
  regulationId: id,
  href: regulationHref(id),
  title: REGULATION_LABELS[id].title,
  shortLabel: REGULATION_LABELS[id].short,
  description: REGULATION_DESCRIPTIONS[id],
}));

export function isRegulationId(value: string | null | undefined): value is RegulationId {
  return (REGULATION_IDS as readonly string[]).includes(value ?? "");
}

/** Regulation shown at `pathname` ("/quy-che/ky-luat" → "ky-luat"), undefined elsewhere. */
export function regulationIdForPath(pathname: string): RegulationId | undefined {
  const m = /^\/quy-che\/([^/?#]+)\/?$/.exec(pathname);
  return m && isRegulationId(m[1]) ? m[1] : undefined;
}

/** `metadata` export for a route segment layout: `export const metadata = routeMetadata("ranking")`. */
export function routeMetadata(id: AppRouteId): Metadata {
  return { title: APP_ROUTES[id].title };
}

/** Is `href` the current page (exact for "/", prefix match for the others)? */
export function isRouteActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Route owning `pathname` (longest matching href), undefined for unknown paths. */
export function routeForPath(pathname: string): AppRoute | undefined {
  let best: AppRoute | undefined;
  for (const r of APP_ROUTE_LIST) {
    if (isRouteActive(r.href, pathname) && (!best || r.href.length > best.href.length)) best = r;
  }
  return best;
}

export interface RouteAccessContext {
  can: (p: Permission) => boolean;
  /** Number of levels the user can access. */
  levelCount: number;
}

/** Should the route appear in navigation for this user? */
export function canSeeRoute(route: AppRoute, ctx: RouteAccessContext): boolean {
  if (!ctx.can(route.permission)) return false;
  if (route.multiLevel && ctx.levelCount < 2) return false;
  return true;
}
