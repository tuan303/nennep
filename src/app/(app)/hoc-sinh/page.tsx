"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { StudentsScreen } from "@/components/students-view/students-screen";

/** Học sinh vi phạm (SCR-06, FR-STU-001/002, FR-RAG-004). */
export default function StudentsPage() {
  return (
    <RequirePermission p="view.dashboard">
      <DatasetGate>{(ds) => <StudentsScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
