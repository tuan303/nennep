"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { ReportScreen } from "@/components/report/report-screen";

/** Báo cáo tuần/tháng (REQ_V2 §6.5): A4 report per recipient (BGH / tổ khối / GVCN), print/PDF, Excel chi tiết. */
export default function ReportPage() {
  return (
    <RequirePermission p="view.dashboard">
      <DatasetGate>{(ds) => <ReportScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
