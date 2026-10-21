"use client";
import { DatasetGate, RequirePermission } from "@/components/app/shell";
import { RankingScreen } from "@/components/ranking/ranking-screen";

/** SCR-03 Xếp hạng thi đua (FR-RANK-001…006, FR-RAG-001/002). */
export default function RankingPage() {
  return (
    <RequirePermission p="view.dashboard">
      <DatasetGate>{(ds) => <RankingScreen ds={ds} />}</DatasetGate>
    </RequirePermission>
  );
}
