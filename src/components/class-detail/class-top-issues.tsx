"use client";
import { ListOrdered, PartyPopper } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import type { IssueStat } from "@/lib/engine";
import { IssueBars } from "../ranking/issue-bars";

/** "Lỗi thường gặp" of the class in the period (engine topIssues). */
export function ClassTopIssues({ issues, className }: { issues: IssueStat[]; className?: string }) {
  return (
    <Card className={className} icon={ListOrdered} title="Lỗi thường gặp" subtitle="Xếp theo số lượt, sau đó theo điểm trừ">
      {issues.length === 0 ? (
        <EmptyState size="sm" icon={PartyPopper} tone="ok" title="Chưa có lỗi nào trong kỳ này" description="Lớp đang giữ nền nếp tốt." />
      ) : (
        <IssueBars issues={issues} max={6} details />
      )}
    </Card>
  );
}
