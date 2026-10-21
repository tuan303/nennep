"use client";
/** Small domain badges: scope, period, penalty unit, student status and student alert. */
import { CalendarRange, CircleCheck, Repeat, Siren, User, Users, type LucideIcon } from "lucide-react";
import { Badge, Tooltip, type Tone } from "@/components/ui";
import { STUDENT_STATUS_LABELS } from "@/lib/constants";
import { periodLabel } from "@/lib/engine/period";
import type { LevelConfig, Period, Scope, Semester, StudentStatus, Unit } from "@/lib/types";
import { penaltyLabel, unitExplanation } from "./lib/error-options";
import { STUDENT_ALERT_LABELS, studentAlertDescription, type StudentAlert } from "./lib/student-summary";

type Size = "sm" | "md";

/* --------------------------------- Scope --------------------------------- */

export interface ScopeBadgeProps {
  scope: Scope;
  size?: Size;
  className?: string;
}

/** "Cá nhân" (one person icon) / "Tập thể" (group icon). */
export function ScopeBadge({ scope, size = "md", className }: ScopeBadgeProps) {
  const personal = scope === "Cá nhân";
  return (
    <Badge tone={personal ? "brand" : "star"} size={size} icon={personal ? User : Users} className={className}>
      {scope}
    </Badge>
  );
}

/* --------------------------------- Period -------------------------------- */

export interface PeriodBadgeProps {
  period: Period;
  /** Semester names for "Học kỳ I" (usually `ds.config.semesters`). */
  semesters?: Semester[];
  size?: Size;
  className?: string;
}

/** Period label from the engine: "Tuần 12/10 – 18/10/2026", "Tháng 10/2026", "Học kỳ I", "Toàn bộ năm học". */
export function PeriodBadge({ period, semesters = [], size = "md", className }: PeriodBadgeProps) {
  return (
    <Badge tone="brand" variant="outline" size={size} icon={CalendarRange} className={className}>
      {periodLabel(period, semesters)}
    </Badge>
  );
}

/* -------------------------------- Penalty -------------------------------- */

export interface PenaltyPillProps {
  penalty: number;
  unit: Unit;
  size?: Size;
  className?: string;
}

/** "2 điểm/HS" (multiplied by students) or "5 điểm/lần" (multiplied by occurrences). */
export function PenaltyPill({ penalty, unit, size = "sm", className }: PenaltyPillProps) {
  return (
    <Badge
      tone={unit === "/HS" ? "brand" : "star"}
      size={size}
      title={unitExplanation(unit)}
      aria-label={`${penaltyLabel(penalty, unit)}: ${unitExplanation(unit)}`}
      className={className}
    >
      {penaltyLabel(penalty, unit)}
    </Badge>
  );
}

/* ----------------------------- Student status ---------------------------- */

const STATUS_TONE: Record<StudentStatus, Tone> = {
  ACTIVE: "ok",
  TRANSFERRED_OUT: "warn",
  GRADUATED: "brand",
  INACTIVE: "muted",
};

export function StudentStatusBadge({ status, size = "md", className }: { status: StudentStatus; size?: Size; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} size={size} dot className={className}>
      {STUDENT_STATUS_LABELS[status]}
    </Badge>
  );
}

/* ----------------------------- Student alert ----------------------------- */

const ALERT_LOOK: Record<StudentAlert, { tone: Tone; icon: LucideIcon }> = {
  WEEKLY_RED: { tone: "bad", icon: Siren },
  REPEAT: { tone: "warn", icon: Repeat },
  NONE: { tone: "ok", icon: CircleCheck },
};

export interface StudentAlertBadgeProps {
  alert: StudentAlert;
  /** Thresholds for the tooltip ("Có từ 3 lượt vi phạm trở lên trong cùng một tuần"). */
  config?: Pick<LevelConfig, "studentAlert">;
  /** Render "Không có cảnh báo" for NONE (default: render nothing). */
  showNone?: boolean;
  size?: Size;
  className?: string;
}

/** "Cảnh báo đỏ" / "Tái phạm" (icon + text + colour). */
export function StudentAlertBadge({ alert, config, showNone, size = "md", className }: StudentAlertBadgeProps) {
  if (alert === "NONE" && !showNone) return null;
  const look = ALERT_LOOK[alert];
  const tip = config ? studentAlertDescription(alert, config) : undefined;
  const badge = (
    <Badge
      tone={look.tone}
      size={size}
      icon={look.icon}
      variant={alert === "WEEKLY_RED" ? "solid" : "soft"}
      tabIndex={tip ? 0 : undefined}
      aria-label={tip ? `${STUDENT_ALERT_LABELS[alert]}. ${tip}` : undefined}
      className={className}
    >
      {STUDENT_ALERT_LABELS[alert]}
    </Badge>
  );
  return tip ? <Tooltip content={tip}>{badge}</Tooltip> : badge;
}
