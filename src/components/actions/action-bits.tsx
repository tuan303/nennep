"use client";
/** Small presentational pieces shared by the action screens (deadline countdown, owner, class scope, severity). */
import { AlarmClock, CalendarCheck2, CalendarClock, CircleAlert, Info, School, TriangleAlert } from "lucide-react";
import { Avatar, Badge, cn } from "@/components/ui";
import { formatDateVN, formatDayMonthVN } from "@/lib/engine";
import type { ActionItem } from "@/lib/types";
import { deadlineState } from "./lib/action-view";
import { SEVERITY_META, type Severity } from "./lib/brief-text";

/** "24/10 · còn 2 ngày" / "18/10 · quá hạn 3 ngày" (red) / "hoàn thành đúng hạn". */
export function DeadlineBadge({
  item,
  today,
  size = "sm",
  withDate = true,
  className,
}: {
  item: Pick<ActionItem, "status" | "deadline" | "closedAt">;
  today: string;
  size?: "sm" | "md";
  withDate?: boolean;
  className?: string;
}) {
  const st = deadlineState(item, today);
  const Icon = st.kind === "done" ? CalendarCheck2 : st.kind === "overdue" ? AlarmClock : CalendarClock;
  const date = withDate ? formatDayMonthVN(item.deadline) : "";
  return (
    <Badge
      tone={st.tone}
      size={size}
      icon={Icon}
      variant={st.kind === "overdue" ? "solid" : "soft"}
      className={className}
      title={`Hạn xử lý ${formatDateVN(item.deadline)}`}
    >
      {date ? `${date} · ${st.label}` : st.label.charAt(0).toLocaleUpperCase("vi") + st.label.slice(1)}
    </Badge>
  );
}

/** Avatar initials + owner text ("GVCN lớp 6A03", "Cán bộ nền nếp"…). */
export function OwnerChip({ owner, className, size = "xs" }: { owner: string; className?: string; size?: "xs" | "sm" }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Avatar name={owner} size={size} />
      <span className="truncate text-[13px] font-medium text-slate-700">{owner}</span>
    </span>
  );
}

export function ScopeClassPill({ code, size = "sm", className }: { code?: string; size?: "sm" | "md"; className?: string }) {
  if (!code) return null;
  return (
    <Badge tone="brand" variant="outline" size={size} icon={School} className={className}>
      Lớp {code}
    </Badge>
  );
}

const SEVERITY_ICON = { high: CircleAlert, medium: TriangleAlert, low: Info } as const;

/** Finding severity: Cao (red) / Trung bình (amber) / Thấp (grey) – icon + text + colour. */
export function SeverityBadge({ severity, size = "sm" }: { severity: Severity; size?: "sm" | "md" }) {
  const meta = SEVERITY_META[severity];
  return (
    <Badge tone={meta.tone} size={size} icon={SEVERITY_ICON[severity]}>
      {meta.label}
    </Badge>
  );
}
