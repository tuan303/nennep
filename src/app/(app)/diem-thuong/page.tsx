"use client";
import { RequirePermission } from "@/components/app/shell";
import { RewardsScreen } from "@/components/rewards/rewards-screen";

/**
 * Điểm thưởng (SCR-08) – record rewards for classes and verify them. REQ_V2 §7.2: guarded by reward.propose, so a GVCN
 * can propose rewards for own classes (the server keeps reward.create rules for ADMIN / EDITOR).
 */
export default function RewardsPage() {
  return (
    <RequirePermission p="reward.propose">
      <RewardsScreen />
    </RequirePermission>
  );
}
