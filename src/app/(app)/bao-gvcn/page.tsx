"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { GvcnReportScreen } from "@/components/gvcn-report/gvcn-report-screen";

/** Báo GVCN (SCR-05, FR-GVCN-001..003, AC-013). */
export default function GvcnReportPage() {
  return (
    <RequirePermission p="view.dashboard">
      <DatasetGate>{(ds) => <GvcnReportScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
