"use client";
import { RequirePermission } from "@/components/app/shell";
import { EntryScreen } from "@/components/entry/entry-screen";

/**
 * Nhập liệu (SCR-07) – mobile-first incident entry with live points preview, and (REQ_V2 §7.1) the "Đợt kiểm tra" tab
 * for inspection.manage holders.
 */
export default function EntryPage() {
  return (
    <RequirePermission p={["incident.create", "inspection.manage"]}>
      <EntryScreen />
    </RequirePermission>
  );
}
