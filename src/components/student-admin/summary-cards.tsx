"use client";
import { Scale, ShieldAlert, UserMinus, Users } from "lucide-react";
import { KpiCard } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { leftBreakdownText, type SizeSummary, type StatusCounts } from "./lib/roster";

export interface SummaryCardsProps {
  counts: StatusCounts;
  size: SizeSummary;
  /** ACTIVE students named in at least one incident this school year. */
  withViolations: number;
  onShowActive: () => void;
  onShowLeft: () => void;
  onShowSizes: () => void;
}

/** Top KPI row: Đang học · Đã chuyển/nghỉ · Lớp lệch sĩ số · HS có vi phạm. */
export function SummaryCards({ counts, size, withViolations, onShowActive, onShowLeft, onShowSizes }: SummaryCardsProps) {
  const avg = size.classes > 0 ? counts.ACTIVE / size.classes : 0;
  const breakdown = leftBreakdownText(counts);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard
        label="Đang học"
        value={counts.ACTIVE}
        unit="HS"
        icon={Users}
        tone="brand"
        onClick={onShowActive}
        footer={size.classes > 0 ? `${fmtNumber(size.classes)} lớp · TB ${fmtNumber(avg, 1)} HS/lớp` : "Chưa có lớp đang hoạt động"}
      />
      <KpiCard
        label="Đã chuyển / nghỉ"
        value={counts.left}
        unit="HS"
        icon={UserMinus}
        tone={counts.left > 0 ? "warn" : "muted"}
        onClick={onShowLeft}
        hint="Gồm học sinh đã chuyển trường, đã tốt nghiệp và ngừng theo dõi. Lịch sử vi phạm của các em vẫn được giữ."
        footer={breakdown || "Chưa có học sinh rời trường"}
      />
      <KpiCard
        label="Lớp lệch sĩ số"
        value={size.mismatches}
        unit="lớp"
        icon={Scale}
        tone={size.mismatches > 0 ? "warn" : "ok"}
        onClick={onShowSizes}
        hint="So sánh số học sinh đang học với sĩ số nguồn của lớp (Cài đặt → Lớp & GVCN)."
        footer={
          size.withSource === 0
            ? "Chưa có sĩ số nguồn để so sánh"
            : size.inactiveWithStudents > 0
              ? `${size.inactiveWithStudents} lớp ngừng hoạt động vẫn còn HS`
              : `So với sĩ số nguồn của ${fmtNumber(size.withSource)} lớp`
        }
      />
      <KpiCard
        label="HS có vi phạm"
        value={withViolations}
        unit="HS"
        icon={ShieldAlert}
        tone={withViolations > 0 ? "bad" : "ok"}
        hint="Học sinh đang học có tên trong ít nhất một sự việc của năm học."
        footer={counts.ACTIVE > 0 ? `${fmtPercent(withViolations / counts.ACTIVE)} học sinh đang học` : undefined}
      />
    </div>
  );
}
