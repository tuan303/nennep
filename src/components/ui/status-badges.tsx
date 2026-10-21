import {
  CircleCheck,
  CircleDashed,
  CircleQuestionMark,
  CircleX,
  Clock,
  Flag,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Star,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ActionStatus, DataCheck, DataIssue, IncidentStatus, Priority, RagStatus, RewardStatus } from "@/lib/types";
import { ACTION_STATUS_LABELS, DATA_CHECK_LABELS, PRIORITY_LABELS, RAG_LABELS } from "@/lib/constants";
import { fmtTopLabel } from "@/lib/client/format";
import { Badge } from "./badge";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";
import type { Tone } from "./tones";

interface Look {
  tone: Tone;
  icon: LucideIcon;
  short: string;
}

/* --------------------------------- RAG ---------------------------------- */

const RAG_LOOK: Record<RagStatus, Look> = {
  GREEN: { tone: "ok", icon: CircleCheck, short: "Xanh" },
  YELLOW: { tone: "warn", icon: TriangleAlert, short: "Vàng" },
  RED: { tone: "bad", icon: CircleX, short: "Đỏ" },
  GRAY: { tone: "muted", icon: CircleQuestionMark, short: "Xám" },
};

export interface RagBadgeProps {
  rag: RagStatus;
  /** Why this colour (e.g. "TB 12,5 điểm trừ/tuần ≥ ngưỡng vàng 10"). Shown as tooltip + read by screen readers. */
  reason?: string;
  /** Short text ("Vàng") instead of the full label ("Vàng – Cần chú ý"). */
  compact?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** RAG status: icon + text + colour (NFR-ACC-01). */
export function RagBadge({ rag, reason, compact, size = "md", className }: RagBadgeProps) {
  const look = RAG_LOOK[rag];
  const label = compact ? look.short : RAG_LABELS[rag];
  const badge = (
    <Badge
      tone={look.tone}
      size={size}
      icon={look.icon}
      tabIndex={reason ? 0 : undefined}
      aria-label={reason ? `${RAG_LABELS[rag]}. ${reason}` : compact ? RAG_LABELS[rag] : undefined}
      className={cn(reason && "cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", className)}
    >
      {label}
    </Badge>
  );
  return reason ? <Tooltip content={reason}>{badge}</Tooltip> : badge;
}

/* -------------------------------- Top 90 -------------------------------- */

export interface Top90BadgeProps {
  inTop90: boolean;
  /** config.top90Ratio of the level (default 0.9): the label follows it ("Top 80%" when set to 0.8). */
  ratio?: number;
  size?: "sm" | "md";
  /** Optional tooltip, e.g. "Hạng 3/12 · ngưỡng Top 90%: hạng 11". */
  hint?: string;
  className?: string;
}

/** Gold star "Top 90%" or muted "Ngoài Top 90%" (percentage = `ratio`). */
export function Top90Badge({ inTop90, ratio, size = "md", hint, className }: Top90BadgeProps) {
  const top = fmtTopLabel(ratio);
  const badge = inTop90 ? (
    <Badge
      tone="star"
      size={size}
      icon={Star}
      iconClassName="fill-star-500 text-star-600"
      tabIndex={hint ? 0 : undefined}
      className={cn("bg-gradient-to-b from-star-50 to-star-100 ring-star-500/45", className)}
      aria-label={hint ? `Thuộc ${top}. ${hint}` : `Thuộc ${top}`}
    >
      {top}
    </Badge>
  ) : (
    <Badge
      tone="muted"
      size={size}
      variant="outline"
      icon={Star}
      iconClassName="text-slate-400"
      tabIndex={hint ? 0 : undefined}
      className={cn("text-slate-500", className)}
      aria-label={hint ? `Ngoài ${top}. ${hint}` : undefined}
    >
      {`Ngoài ${top}`}
    </Badge>
  );
  return hint ? <Tooltip content={hint}>{badge}</Tooltip> : badge;
}

/* ------------------------------ Data check ------------------------------ */

const DC_LOOK: Record<DataCheck, Look> = {
  OK: { tone: "ok", icon: ShieldCheck, short: DATA_CHECK_LABELS.OK },
  THIEU_TEN_HS: { tone: "warn", icon: TriangleAlert, short: DATA_CHECK_LABELS.THIEU_TEN_HS },
  REVIEW: { tone: "bad", icon: CircleQuestionMark, short: DATA_CHECK_LABELS.REVIEW },
};

export interface DataCheckBadgeProps {
  dataCheck: DataCheck;
  /** Issues listed in the tooltip. */
  issues?: DataIssue[];
  size?: "sm" | "md";
  className?: string;
}

export function DataCheckBadge({ dataCheck, issues, size = "md", className }: DataCheckBadgeProps) {
  const look = DC_LOOK[dataCheck];
  const tip = issues && issues.length > 0 ? issues.map((i) => i.message).join(" · ") : undefined;
  const badge = (
    <Badge
      tone={look.tone}
      size={size}
      icon={look.icon}
      tabIndex={tip ? 0 : undefined}
      aria-label={tip ? `${look.short}. ${tip}` : undefined}
      className={cn(tip && "cursor-help", className)}
    >
      {look.short}
    </Badge>
  );
  return tip ? <Tooltip content={tip}>{badge}</Tooltip> : badge;
}

/* -------------------------- Workflow statuses --------------------------- */

export type AnyStatus = IncidentStatus | RewardStatus | ActionStatus;

const STATUS_LOOK: Record<AnyStatus, Look> = {
  "Mới ghi nhận": { tone: "brand", icon: Sparkles, short: "Mới ghi nhận" },
  "Đang xử lý": { tone: "warn", icon: LoaderCircle, short: "Đang xử lý" },
  "Đã đóng": { tone: "muted", icon: CircleCheck, short: "Đã đóng" },
  "Đang xác minh": { tone: "warn", icon: Clock, short: "Đang xác minh" },
  "Đã xác nhận": { tone: "ok", icon: CircleCheck, short: "Đã xác nhận" },
  Open: { tone: "brand", icon: CircleDashed, short: ACTION_STATUS_LABELS.Open },
  Doing: { tone: "warn", icon: LoaderCircle, short: ACTION_STATUS_LABELS.Doing },
  Done: { tone: "ok", icon: CircleCheck, short: ACTION_STATUS_LABELS.Done },
};

export interface StatusBadgeProps {
  status: AnyStatus;
  size?: "sm" | "md";
  className?: string;
}

/** Incident / reward / action workflow status (Vietnamese label, icon, colour). */
export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const look = STATUS_LOOK[status];
  return (
    <Badge tone={look.tone} size={size} icon={look.icon} className={className}>
      {look.short}
    </Badge>
  );
}

/* ------------------------------- Priority ------------------------------- */

const PRIORITY_TONE: Record<Priority, Tone> = { High: "bad", Medium: "warn", Low: "muted" };

export function PriorityBadge({ priority, size = "md", className }: { priority: Priority; size?: "sm" | "md"; className?: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} size={size} variant="outline" icon={Flag} className={className}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
