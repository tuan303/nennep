"use client";
import { Percent, Repeat, Siren, Users } from "lucide-react";
import { KpiCard, cn } from "@/components/ui";
import { studentAlertDescription } from "@/components/app/widgets";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { LevelConfig } from "@/lib/types";
import type { AlertFilter, StudentsSummary } from "./lib/students-model";

export interface StudentsSummaryCardsProps {
  summary: StudentsSummary;
  config: Pick<LevelConfig, "studentAlert">;
  /** Current alert filter of the table (highlights the matching card). */
  alert: AlertFilter;
  /** Clicking a card filters the table. */
  onAlert: (alert: AlertFilter) => void;
}

const ACTIVE_RING = "ring-2 ring-offset-0";

/** 4 summary cards: HS có vi phạm · HS tái phạm · HS cảnh báo đỏ · % HS có vi phạm / HS đang học. */
export function StudentsSummaryCards({ summary, config, alert, onAlert }: StudentsSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard
        label="HS có vi phạm"
        value={summary.withIncidents}
        icon={Users}
        tone="brand"
        hint="Học sinh được ghi tên trong ít nhất một sự việc của phạm vi đang lọc."
        onClick={() => onAlert("ALL")}
      />
      <KpiCard
        label="HS tái phạm"
        value={summary.repeat}
        icon={Repeat}
        tone="warn"
        hint={studentAlertDescription("REPEAT", config)}
        onClick={() => onAlert("REPEAT")}
        className={cn(alert === "REPEAT" && `${ACTIVE_RING} ring-warn/50`)}
      />
      <KpiCard
        label="HS cảnh báo đỏ"
        value={summary.weeklyRed}
        icon={Siren}
        tone="bad"
        hint={studentAlertDescription("WEEKLY_RED", config)}
        onClick={() => onAlert("WEEKLY_RED")}
        className={cn(alert === "WEEKLY_RED" && `${ACTIVE_RING} ring-bad/45`)}
      />
      <KpiCard
        label="Tỷ lệ HS có vi phạm"
        value={fmtPercent(summary.ratio, 1)}
        icon={Percent}
        tone="muted"
        hint="Số học sinh đang học có vi phạm / tổng số học sinh đang học trong phạm vi lọc (khối, lớp)."
        footer={
          <span className="num">
            {fmtNumber(summary.activeWithIncidents)}/{fmtNumber(summary.activeInScope)} HS đang học
          </span>
        }
      />
    </div>
  );
}
