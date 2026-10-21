"use client";
/**
 * Page-level guards: RequirePermission (403 card), LevelGuard (level access) and DatasetGate
 * (loading skeleton / error with retry / render with the dataset of the selected level).
 * The server enforces every permission; these only keep the UI honest and friendly.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { House, Layers, ShieldAlert, type LucideIcon } from "lucide-react";
import { Card, EmptyState, ErrorState, buttonClasses } from "@/components/ui";
import { useDataset, useLevel } from "@/lib/client/data";
import { useSession } from "@/lib/client/session";
import { LEVELS, type Permission } from "@/lib/constants";
import type { LevelDataset, LevelId } from "@/lib/types";
import { PageSkeleton } from "./page-skeleton";

function HomeLink() {
  return (
    <Link href="/" className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <House aria-hidden className="size-4" strokeWidth={2.25} />
      Về Tổng quan
    </Link>
  );
}

export interface AccessNoticeProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Defaults to a "Về Tổng quan" link. Pass null to hide. */
  action?: ReactNode | null;
}

/** Friendly card for "you cannot see this" situations. */
export function AccessNotice({ title, description, icon = ShieldAlert, action }: AccessNoticeProps) {
  return (
    <Card padding="none">
      <EmptyState icon={icon} tone="warn" title={title} description={description} action={action === undefined ? <HomeLink /> : action} />
    </Card>
  );
}

export interface RequirePermissionProps {
  /** Permission needed; with an array, ANY of them is enough. */
  p: Permission | readonly Permission[];
  children: ReactNode;
  /** Rendered instead of the default 403 card. */
  fallback?: ReactNode;
}

/** Renders children only when the signed-in user has the permission; otherwise a friendly 403 card. */
export function RequirePermission({ p, children, fallback }: RequirePermissionProps) {
  const { status, can } = useSession();
  if (status !== "signedIn") return null; // the app guard shows the loading / sign-in states
  const perms: readonly Permission[] = typeof p === "string" ? [p] : p;
  if (perms.some((x) => can(x))) return <>{children}</>;
  return (
    <>
      {fallback ?? (
        <AccessNotice
          title="Bạn không có quyền truy cập chức năng này"
          description="Chức năng này chưa được cấp cho tài khoản của bạn. Nếu cần sử dụng, vui lòng liên hệ quản trị viên."
        />
      )}
    </>
  );
}

export interface LevelGuardProps {
  children: ReactNode;
  /** Minimum number of accessible levels (2 for school-wide pages). Default 1. */
  minLevels?: number;
  /** The page only supports these levels (e.g. a THCS-only report). Checked against the selected level. */
  levels?: readonly LevelId[];
  fallback?: ReactNode;
}

/** Renders children only when the user can access enough levels (and the selected level is supported). */
export function LevelGuard({ children, minLevels = 1, levels, fallback }: LevelGuardProps) {
  const { levelId, accessibleLevels } = useLevel();
  if (accessibleLevels.length === 0) return <>{fallback ?? <NoLevelNotice />}</>;
  if (accessibleLevels.length < minLevels) {
    const names = accessibleLevels.map((l) => LEVELS[l].name).join(", ");
    return (
      <>
        {fallback ?? (
          <AccessNotice
            icon={Layers}
            title="Trang này dành cho tài khoản xem nhiều cấp học"
            description={`Tài khoản của bạn hiện chỉ xem được cấp ${names}. Vui lòng dùng trang Tổng quan của cấp học này.`}
          />
        )}
      </>
    );
  }
  if (levels && !levels.includes(levelId)) {
    const names = levels.map((l) => LEVELS[l].name).join(", ");
    return (
      <>
        {fallback ?? (
          <AccessNotice icon={Layers} title="Chức năng chưa áp dụng cho cấp học này" description={`Chức năng này hiện dành cho: ${names}. Hãy chọn cấp học khác ở thanh trên cùng.`} action={null} />
        )}
      </>
    );
  }
  return <>{children}</>;
}

function NoLevelNotice() {
  return (
    <AccessNotice
      icon={Layers}
      title="Tài khoản chưa được gán cấp học"
      description="Bạn chưa được phân quyền xem dữ liệu của cấp học nào. Vui lòng liên hệ quản trị viên để được cấp quyền."
      action={null}
    />
  );
}

export interface DatasetGateProps {
  /** Render prop called with the loaded dataset. */
  children: (dataset: LevelDataset) => ReactNode;
  /** Level to load (default: the selected level). */
  levelId?: LevelId;
  /** Custom loading placeholder (default: PageSkeleton). */
  fallback?: ReactNode;
}

/**
 * Loads the dataset of the selected (or given) level: skeleton while loading, ErrorState with retry when it
 * failed and nothing is cached, otherwise `children(dataset)` (stale data stays visible while refreshing).
 */
export function DatasetGate({ children, levelId, fallback }: DatasetGateProps) {
  const { accessibleLevels } = useLevel();
  const { dataset, status, error, refresh, refreshing } = useDataset(levelId);
  if (accessibleLevels.length === 0) return <NoLevelNotice />;
  if (dataset) return <>{children(dataset)}</>;
  if (status === "error") {
    return (
      <Card padding="none">
        <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} />
      </Card>
    );
  }
  return <>{fallback ?? <PageSkeleton />}</>;
}
