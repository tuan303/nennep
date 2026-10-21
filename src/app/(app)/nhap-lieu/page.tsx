"use client";
import { RequirePermission } from "@/components/app/shell";
import { EntryScreen } from "@/components/entry/entry-screen";

/** Nhập liệu sự việc (SCR-07) – mobile-first incident entry with live points preview. */
export default function EntryPage() {
  return (
    <RequirePermission p="incident.create">
      <EntryScreen />
    </RequirePermission>
  );
}
