"use client";
import { RequirePermission } from "@/components/app/shell";
import { RewardsScreen } from "@/components/rewards/rewards-screen";

/** Điểm thưởng (SCR-08) – record rewards for classes and verify them. */
export default function RewardsPage() {
  return (
    <RequirePermission p="reward.create">
      <RewardsScreen />
    </RequirePermission>
  );
}
