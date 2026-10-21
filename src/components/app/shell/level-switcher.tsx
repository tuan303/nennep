"use client";
import { useMemo } from "react";
import { Badge, SegmentedControl, Select, cn } from "@/components/ui";
// Pure registry of the pages' unsaved-input guards (entry, rewards, settings) – no React / page code is pulled in.
import { requestLeave } from "@/components/entry/lib/leave-guard";
import { useLevel } from "@/lib/client/data";
import { LEVELS, LEVEL_THEME } from "@/lib/constants";
import type { LevelId } from "@/lib/types";

export interface LevelSwitcherProps {
  /** "auto" = segmented control from 768px, native select below. */
  variant?: "auto" | "segmented" | "select";
  className?: string;
}

/**
 * Level ("cấp học") switcher limited to the user's accessible levels: "Tiểu học | THCS | THPT".
 * A single accessible level renders a static label; none renders nothing.
 * Switching drops the current page's form: with unsaved input the page's "Bỏ … ?" dialog asks first (UX-1).
 */
export function LevelSwitcher({ variant = "auto", className }: LevelSwitcherProps) {
  const { levelId, setLevelId, accessibleLevels } = useLevel();
  const options = useMemo(
    () =>
      accessibleLevels.map((l) => ({
        value: l,
        label: (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full ring-1 ring-black/10" style={{ backgroundColor: LEVEL_THEME[l].brand }} />
            {LEVELS[l].short}
          </span>
        ),
      })),
    [accessibleLevels],
  );
  const selectOptions = useMemo(() => accessibleLevels.map((l) => ({ value: l, label: LEVELS[l].short })), [accessibleLevels]);
  const switchTo = (next: LevelId | undefined) => {
    if (next && next !== levelId) requestLeave(() => setLevelId(next));
  };

  if (accessibleLevels.length === 0) return null;
  if (accessibleLevels.length === 1) {
    return (
      <Badge tone="muted" size="md" className={cn("h-8 gap-1.5 bg-acc-soft px-3 text-[13px] text-acc-ink ring-acc/30", className)} title={`Cấp học: ${LEVELS[levelId].name}`}>
        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: LEVEL_THEME[levelId].brand }} />
        {LEVELS[levelId].short}
      </Badge>
    );
  }

  const segmented = (
    <SegmentedControl<LevelId>
      options={options}
      value={levelId}
      onChange={switchTo}
      size="sm"
      ariaLabel="Cấp học"
      activeClassName="bg-acc-fill text-acc-on shadow-sm [&_span[aria-hidden]]:ring-white/60"
    />
  );
  const select = (
    <Select<LevelId>
      aria-label="Cấp học"
      options={selectOptions}
      value={levelId}
      onChange={switchTo}
      wrapperClassName="w-[118px]"
      className="border-l-4 border-l-acc font-semibold text-acc-ink"
    />
  );

  if (variant === "segmented") return <div className={className}>{segmented}</div>;
  if (variant === "select") return <div className={className}>{select}</div>;
  return (
    <div className={className}>
      <div className="hidden md:block">{segmented}</div>
      <div className="md:hidden">{select}</div>
    </div>
  );
}
