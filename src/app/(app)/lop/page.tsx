"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { ClassScreen } from "@/components/class-detail/class-screen";

/** SCR-04 Khối & lớp (FR-CLS-001/002). Deep link: /lop?class=6A03 (global class filter). */
export default function ClassesPage() {
  return (
    <RequirePermission p="view.dashboard">
      <DatasetGate>{(ds) => <ClassScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
