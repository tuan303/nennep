"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { useReportMailView } from "@/components/report/mail/use-batch-watches";
import { ReportScreen } from "@/components/report/report-screen";
import { useLevel } from "@/lib/client/data";

/** Báo cáo tuần/tháng (REQ_V2 §6.5): A4 report per recipient (BGH / tổ khối / GVCN), print/PDF, Excel chi tiết. */
export default function ReportPage() {
  return (
    <RequirePermission p="view.dashboard">
      <ReportMailView />
      <DatasetGate>{(ds) => <ReportScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}

/**
 * Tells the report-mail batches (followed outside the report screen) which level this page shows – also while the
 * level's data loads and the screen is not mounted – so a batch of another level toasts "Chuyển sang cấp …".
 */
function ReportMailView() {
  useReportMailView(useLevel().levelId);
  return null;
}
