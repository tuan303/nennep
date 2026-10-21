"use client";
import { RequirePermission } from "@/components/app/shell";
import { SettingsScreen } from "@/components/settings/settings-screen";

/** Cài đặt (Admin): level settings need settings.manage, the Người dùng tab needs users.manage. */
export default function SettingsPage() {
  return (
    <RequirePermission p={["settings.manage", "users.manage"]}>
      <SettingsScreen />
    </RequirePermission>
  );
}
