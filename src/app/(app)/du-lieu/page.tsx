"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { DataInspectScreen } from "@/components/data-inspect/data-inspect-screen";

/** SCR-11 Dữ liệu & rà soát (data.inspect; restoring deleted records needs record.delete). */
export default function DataReviewPage() {
  return (
    <RequirePermission p="data.inspect">
      <DatasetGate>{(ds) => <DataInspectScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
