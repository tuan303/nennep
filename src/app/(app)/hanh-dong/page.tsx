"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { ActionsScreen } from "@/components/actions/actions-screen";

/** Hành động điều hành: Bản tóm tắt quyết định · Sổ hành động · Quá hạn & leo thang (ARCHITECTURE §7). */
export default function ActionsPage() {
  return (
    <RequirePermission p="actions.view">
      <DatasetGate>{(ds) => <ActionsScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
