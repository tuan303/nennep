"use client";
import { RequirePermission, useShellOptions } from "@/components/app/shell";
import { AuditScreen } from "@/components/audit/audit-screen";

/** Nhật ký hệ thống (SCR-10, FR-AUD-001/002) – school-wide, so the global filters are hidden. */
export default function AuditLogPage() {
  useShellOptions({ hideFilters: true });
  return (
    <RequirePermission p="audit.view">
      <AuditScreen />
    </RequirePermission>
  );
}
