"use client";
import Link from "next/link";
import { LayoutDashboard, Plus, Printer, Settings, ShieldAlert, Trophy } from "lucide-react";
import { Button, PageHeader, buttonClasses } from "@/components/ui";
import { PeriodBadge } from "@/components/app/widgets";
import { LEVELS } from "@/lib/constants";
import { fmtRelative } from "@/lib/client/format";
import type { LevelDataset, Period } from "@/lib/types";
import { hrefWithParams } from "../lib/view-helpers";
import { Notice } from "../shared/parts";

export interface OverviewHeaderProps {
  ds: LevelDataset;
  period: Period;
  /** Current query string (filters kept when opening Xếp hạng). */
  search: string;
  canCreate: boolean;
}

export function OverviewHeader({ ds, period, search, canCreate }: OverviewHeaderProps) {
  return (
    <PageHeader
      icon={LayoutDashboard}
      eyebrow={`${LEVELS[ds.levelId].name} · Năm học ${ds.config.schoolYear}`}
      title="Tổng quan nền nếp"
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <PeriodBadge period={period} semesters={ds.config.semesters} size="sm" />
          <span className="text-[13px] text-slate-500">Cập nhật {fmtRelative(ds.generatedAt)}</span>
        </span>
      }
      actions={
        <>
          <Button variant="ghost" icon={Printer} onClick={() => window.print()} className="hidden sm:inline-flex">
            In
          </Button>
          <Link href={hrefWithParams("/xep-hang", search)} className={buttonClasses({ variant: "secondary" })}>
            <Trophy aria-hidden className="size-[18px]" strokeWidth={2.25} />
            Xem xếp hạng
          </Link>
          {canCreate ? (
            <Link href="/nhap-lieu" className={buttonClasses({ variant: "gold" })}>
              <Plus aria-hidden className="size-[18px]" strokeWidth={2.5} />
              Nhập sự việc
            </Link>
          ) : null}
        </>
      }
    />
  );
}

/** Banner shown while the RAG thresholds of the level are not approved (every class is GRAY). */
export function RagApprovalNotice({ canManage }: { canManage: boolean }) {
  return (
    <Notice
      tone="warn"
      icon={ShieldAlert}
      title="Ngưỡng cảnh báo RAG chưa được phê duyệt – trạng thái lớp đang hiển thị Xám"
      action={
        canManage ? (
          <Link href="/cai-dat?tab=cau-hinh" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <Settings aria-hidden className="size-4" strokeWidth={2.25} />
            Phê duyệt ngưỡng
          </Link>
        ) : undefined
      }
    >
      {canManage
        ? "Vào Cài đặt → Cấu hình để kiểm tra và phê duyệt ngưỡng Vàng/Đỏ cho cấp học này."
        : "Màu Xanh/Vàng/Đỏ sẽ hiển thị sau khi Quản trị phê duyệt ngưỡng cảnh báo."}
    </Notice>
  );
}
