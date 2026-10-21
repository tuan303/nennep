"use client";
import { DatasetGate, PageSkeleton, RequirePermission } from "@/components/app/shell";
import { OverviewScreen } from "@/components/dashboard/overview/overview-screen";

/** "/" – Tổng quan nền nếp (SCR-02). */
export default function OverviewPage() {
  return (
    <RequirePermission p="view.dashboard">
      <DatasetGate fallback={<PageSkeleton kpis={6} label="Đang tải tổng quan…" />}>{(ds) => <OverviewScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
