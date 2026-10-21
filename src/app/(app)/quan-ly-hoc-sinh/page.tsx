"use client";
import { DatasetGate, RequirePermission, useShellOptions } from "@/components/app/shell";
import { StudentAdminScreen } from "@/components/student-admin/student-admin-screen";

/** Quản lý học sinh (SCR-09): roster, tuyển mới / chuyển đến, chuyển lớp, chuyển trường, import danh sách. */
export default function StudentAdminPage() {
  // Local filters only: the global period/class filter bar does not apply to the roster.
  useShellOptions({ hideFilters: true });
  return (
    <RequirePermission p="students.manage">
      {/* Keyed by level: switching level resets filters, dialogs and the import wizard. */}
      <DatasetGate>{(ds) => <StudentAdminScreen key={ds.levelId} ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
