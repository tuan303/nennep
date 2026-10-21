"use client";
import { LevelGuard, RequirePermission } from "@/components/app/shell";
import { SchoolScreen } from "@/components/dashboard/school/school-screen";

/** "/toan-truong" – Toàn trường: compare the accessible levels (users with ≥ 2 levels). */
export default function SchoolPage() {
  return (
    <RequirePermission p="view.dashboard">
      <LevelGuard minLevels={2}>
        <SchoolScreen />
      </LevelGuard>
    </RequirePermission>
  );
}
