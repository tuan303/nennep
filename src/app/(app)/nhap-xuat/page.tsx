"use client";
import { RequirePermission } from "@/components/app/shell";
import { ExcelScreen } from "@/components/excel-io/excel-screen";

/** Nhập/Xuất Excel (FR-XLS-001..003, FR-SNP-001): each section is shown only with its own permission. */
export default function ExcelPage() {
  return (
    <RequirePermission p={["excel.import", "excel.export"]}>
      <ExcelScreen />
    </RequirePermission>
  );
}
