"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Award, ClipboardPen } from "lucide-react";
import { DatasetGate, useShellOptions } from "@/components/app/shell";
import { draftPrefix } from "@/components/entry/lib/leave-guard";
import { PageHeader, buttonClasses, toast } from "@/components/ui";
import { useLevel } from "@/lib/client/data";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import { rewardDrafts } from "./lib/reward-form";
import { RewardsWorkspace } from "./rewards-workspace";

/** "/diem-thuong" (SCR-08): record rewards and run the verification workflow (FR-RWD-001/002). */
export function RewardsScreen() {
  // The list follows the global period / grade / class filters, so show the filter bar on this page.
  useShellOptions({ hideFilters: false });
  const today = useToday();
  const { can, profile } = useSession();
  const { levelId } = useLevel();
  const uid = profile?.uid;

  // The form of a level is remounted when the level changes; its unsaved input is kept in memory (see RewardFormCard).
  const prevLevel = useRef(levelId);
  useEffect(() => {
    const prev = prevLevel.current;
    prevLevel.current = levelId;
    if (prev === levelId || !uid || !rewardDrafts.hasPrefix(draftPrefix(uid, prev))) return;
    toast.info(`Điểm thưởng đang nhập ở ${LEVELS[prev].short} chưa được lưu`, {
      description: `Thông tin đã được giữ lại – chọn lại ${LEVELS[prev].short} để nhập tiếp.`,
    });
  }, [levelId, uid]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        icon={Award}
        eyebrow={LEVELS[levelId].short}
        title="Điểm thưởng"
        description="Ghi nhận và xác minh điểm thưởng cho tập thể lớp."
        actions={
          can("incident.create") ? (
            <Link href="/nhap-lieu" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <ClipboardPen aria-hidden className="size-4" strokeWidth={2.25} />
              Nhập sự việc
            </Link>
          ) : null
        }
      />
      <DatasetGate>{(ds) => <RewardsWorkspace key={ds.levelId} ds={ds} today={today} />}</DatasetGate>
    </div>
  );
}
