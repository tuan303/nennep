"use client";
import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import { errorMessage } from "@/lib/client/api-errors";
import { APP_NAME } from "@/lib/constants";
import { useSession } from "@/lib/client/session";
import { bottomNavModel, visibleNavGroups, type BottomNavModel, type NavGroup } from "./nav-config";
import { routeForPath, type AppRoute } from "./routes";
import { useShellContext } from "./shell-context";

export interface NavModel {
  groups: NavGroup[];
  bottom: BottomNavModel;
  pathname: string;
  /** Route of the current page (undefined for unknown paths). */
  route?: AppRoute;
}

/** Navigation filtered by the signed-in user's permissions and level count. */
export function useNavModel(): NavModel {
  const { can, accessibleLevels } = useSession();
  const pathname = usePathname() ?? "/";
  const levelCount = accessibleLevels.length;
  return useMemo(() => {
    const ctx = { can, levelCount };
    return { groups: visibleNavGroups(ctx), bottom: bottomNavModel(ctx), pathname, route: routeForPath(pathname) };
  }, [can, levelCount, pathname]);
}

/** Effective shell settings for the current page: route defaults merged with useShellOptions(). */
export function usePageChrome(): { title: string; showFilters: boolean; showLevelSwitcher: boolean } {
  const { options } = useShellContext();
  const pathname = usePathname() ?? "/";
  const route = routeForPath(pathname);
  return {
    title: options.title ?? route?.title ?? APP_NAME,
    showFilters: options.hideFilters !== undefined ? !options.hideFilters : (route?.filters ?? false),
    showLevelSwitcher: options.hideLevelSwitcher !== undefined ? !options.hideLevelSwitcher : (route?.levelSwitcher ?? true),
  };
}

/* ------------------------------- sign out -------------------------------- */

let explicitSignOut = false;

/** True once after the user pressed "Đăng xuất" (the guard then skips the ?next= return path). */
export function consumeExplicitSignOut(): boolean {
  const v = explicitSignOut;
  explicitSignOut = false;
  return v;
}

/** "Đăng xuất" handler: logs out; the app guard then redirects to /dang-nhap. */
export function useSignOut(): () => Promise<void> {
  const { logout } = useSession();
  return useCallback(async () => {
    explicitSignOut = true;
    try {
      await logout();
    } catch (err) {
      explicitSignOut = false;
      toast.error(errorMessage(err, "Không đăng xuất được. Vui lòng thử lại."));
    }
  }, [logout]);
}
