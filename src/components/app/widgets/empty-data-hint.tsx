"use client";
import type { ReactNode } from "react";
import { FilterX, Inbox, SearchX, type LucideIcon } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import type { LevelDataset } from "@/lib/types";

export interface EmptyDataHintProps {
  /** When given, tells "no data at all yet" apart from "nothing matches the filters". */
  ds?: Pick<LevelDataset, "incidents">;
  /** Overrides the automatic choice: true = the level has no incident at all. */
  noDataYet?: boolean;
  /** Shows a "Xóa bộ lọc" button. */
  onReset?: () => void;
  resetLabel?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Extra action(s) next to the reset button. */
  action?: ReactNode;
  icon?: LucideIcon;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Friendly empty block for analytics widgets: "Chưa có dữ liệu" (nothing recorded yet) or
 * "Không có sự việc phù hợp" (filters/period exclude everything) with a way out.
 */
export function EmptyDataHint({
  ds,
  noDataYet,
  onReset,
  resetLabel = "Xóa bộ lọc",
  title,
  description,
  action,
  icon,
  size = "sm",
  className,
}: EmptyDataHintProps) {
  const empty = noDataYet ?? (ds ? ds.incidents.length === 0 : false);
  const defaults = empty
    ? {
        icon: Inbox,
        title: "Chưa có dữ liệu nền nếp",
        description: "Dữ liệu sẽ xuất hiện khi cán bộ nền nếp ghi nhận sự việc đầu tiên hoặc Quản trị nhập file Excel.",
      }
    : {
        icon: SearchX,
        title: "Không có sự việc phù hợp",
        description: "Thử chọn kỳ khác hoặc bỏ bớt bộ lọc để xem thêm dữ liệu.",
      };
  const actions =
    onReset || action ? (
      <>
        {onReset && !empty ? (
          <Button variant="secondary" size="sm" icon={FilterX} onClick={onReset}>
            {resetLabel}
          </Button>
        ) : null}
        {action}
      </>
    ) : undefined;
  return (
    <EmptyState
      icon={icon ?? defaults.icon}
      title={title ?? defaults.title}
      description={description ?? defaults.description}
      action={actions}
      tone={empty ? "brand" : "muted"}
      size={size}
      className={className}
    />
  );
}
