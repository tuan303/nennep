"use client";
/** Stats strip: sign-ins today, failed sign-ins today (warn above 5), imports this week, rows loaded. */
import { DatabaseZap, LogIn, ShieldAlert, Upload } from "lucide-react";
import { KpiCard } from "@/components/ui";
import { FAILED_LOGIN_WARN, countText } from "./lib/audit-query";
import type { AuditStats } from "./use-audit-stats";

export interface AuditStatsStripProps {
  stats: AuditStats;
  loaded: number;
  hasMore: boolean;
  loadingRows: boolean;
  onShowLogins: () => void;
  onShowFailed: () => void;
}

export function AuditStatsStrip({ stats, loaded, hasMore, loadingRows, onShowLogins, onShowFailed }: AuditStatsStripProps) {
  const loading = stats.status === "loading";
  const failed = stats.failedToday;
  const failedHigh = !!failed && (failed.more || failed.count > FAILED_LOGIN_WARN);
  const na = stats.status === "error" ? "–" : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard
        label="Đăng nhập hôm nay"
        value={na ?? (stats.loginsToday ? countText(stats.loginsToday.count, stats.loginsToday.more) : 0)}
        icon={LogIn}
        tone="brand"
        loading={loading}
        footer={stats.loginsToday ? `${stats.loginsToday.users} người dùng` : na ? "Chưa tải được số liệu" : undefined}
        onClick={stats.status === "ready" ? onShowLogins : undefined}
      />
      <KpiCard
        label="Đăng nhập thất bại hôm nay"
        value={na ?? (failed ? countText(failed.count, failed.more) : 0)}
        icon={ShieldAlert}
        tone={failedHigh ? "bad" : failed && failed.count > 0 ? "warn" : "muted"}
        loading={loading}
        hint={`Cảnh báo khi vượt ${FAILED_LOGIN_WARN} lần trong ngày.`}
        footer={
          failed ? (
            failedHigh ? (
              <span className="font-semibold text-bad-strong">Vượt ngưỡng – kiểm tra các tài khoản bị nhập sai mật khẩu</span>
            ) : (
              "Trong ngưỡng bình thường"
            )
          ) : undefined
        }
        onClick={stats.status === "ready" ? onShowFailed : undefined}
      />
      <KpiCard
        label="Nhập dữ liệu tuần này"
        value={na ?? (stats.importsWeek ? countText(stats.importsWeek.count, stats.importsWeek.more) : 0)}
        icon={Upload}
        tone="star"
        loading={loading}
        footer={stats.importsWeek ? `Excel: ${stats.importsWeek.workbook} · Danh sách HS: ${stats.importsWeek.roster}` : undefined}
      />
      <KpiCard
        label="Bản ghi đã tải"
        value={loaded}
        icon={DatabaseZap}
        tone="muted"
        loading={loadingRows}
        footer={hasMore ? "Còn bản ghi cũ hơn – bấm “Tải thêm”" : "Đã tải hết theo bộ lọc"}
      />
    </div>
  );
}
