/**
 * App shell – import from "@/components/app/shell".
 * Server components (route `metadata`) must import `routeMetadata` from "@/components/app/shell/routes" instead.
 */
export { AppShell, loginHref } from "./app-shell";
export { Providers } from "./providers";
export { Logo, LogoMark, STAR_PATH, type LogoProps, type LogoMarkProps, type LogoSize } from "./logo";
export { CreditLine, CREDIT_TEXT, type CreditLineProps } from "./credit-line";
export { Sidebar } from "./sidebar";
export { TopBar } from "./top-bar";
export { BottomNav } from "./bottom-nav";
export { MoreSheet, type MoreSheetProps } from "./more-sheet";
export { LevelSwitcher, type LevelSwitcherProps } from "./level-switcher";
export { FilterBar, FilterBarSkeleton, FilterChips, FilterChipsSkeleton, FilterButton } from "./filter-bar";
export { FilterSheet } from "./filter-sheet";
export { PeriodPicker, type PeriodPickerProps } from "./period-picker";
export { periodChoices, periodText, stepPeriodKey, optionsOfMode, PERIOD_MODES, PERIOD_MODE_OPTIONS, type PeriodOptionLists, type PeriodChoice } from "./period-utils";
export { SyncIndicator } from "./sync-indicator";
export { UserMenu, profileScopeText } from "./user-menu";
export { ChangePasswordDialog, type ChangePasswordDialogProps } from "./change-password-dialog";
export {
  RequirePermission,
  LevelGuard,
  DatasetGate,
  AccessNotice,
  type RequirePermissionProps,
  type LevelGuardProps,
  type DatasetGateProps,
  type AccessNoticeProps,
} from "./guards";
export { PageSkeleton } from "./page-skeleton";
export { AppLoadingScreen, type AppLoadingScreenProps } from "./app-loading";
export { AccountBlocked, AccountBlockedScreen } from "./account-blocked";
export { StatusScreen, NotFoundScreen, type StatusScreenProps } from "./status-screen";
export { useShellOptions, useNavBadge, useFilterSheet, type ShellOptions, type NavBadgeValue } from "./shell-context";
export { useNavModel, usePageChrome, useSignOut, type NavModel } from "./use-nav";
export {
  NAV_GROUPS,
  NAV_ICONS,
  GUIDE_NAV_ITEM,
  FOOTER_NAV_ITEMS,
  visibleNavGroups,
  bottomNavModel,
  activeNavItem,
  type NavItem,
  type NavGroup,
  type FooterNavItem,
  type BottomSlot,
  type BottomNavModel,
} from "./nav-config";
export {
  APP_ROUTES,
  APP_ROUTE_LIST,
  GUIDE_ROUTE,
  guideHref,
  routeForPath,
  isRouteActive,
  canSeeRoute,
  routeMetadata,
  type AppRoute,
  type AppRouteId,
} from "./routes";
export { InShellNotFound } from "./in-shell-not-found";
