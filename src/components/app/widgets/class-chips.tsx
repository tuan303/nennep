"use client";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { SegmentedControl, cn } from "@/components/ui";
import type { LevelDataset } from "@/lib/types";
import { gradeLabel, gradesOf, pickClasses } from "./lib/class-options";

export interface ClassChipsProps {
  ds: Pick<LevelDataset, "classes">;
  value?: string;
  onChange: (code: string) => void;
  /**
   * Grade to show. When omitted, a "Khối" switch is shown (starting at the grade of `value`,
   * else the first grade) and `onGradeChange` reports switches.
   */
  grade?: number;
  onGradeChange?: (grade: number) => void;
  disabledCodes?: readonly string[];
  /** Only these codes (e.g. a GVCN's own classes). */
  restrictTo?: readonly string[];
  /** Second line with the GVCN's given name. */
  showTeacher?: boolean;
  /** Accessible name of the group (default "Chọn lớp"). */
  ariaLabel?: string;
  className?: string;
}

function teacherShort(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(" ") : (parts[0] ?? "");
}

/** Tap grid of the classes of one grade – the fastest way to pick a class on a phone. */
export function ClassChips({
  ds,
  value,
  onChange,
  grade,
  onGradeChange,
  disabledCodes,
  restrictTo,
  showTeacher,
  ariaLabel = "Chọn lớp",
  className,
}: ClassChipsProps) {
  const all = useMemo(() => pickClasses(ds.classes, { restrictTo, keep: value }), [ds.classes, restrictTo, value]);
  const grades = useMemo(() => gradesOf(all), [all]);
  const valueGrade = all.find((c) => c.code === value)?.grade;

  const [innerGrade, setInnerGrade] = useState<number | undefined>(valueGrade ?? grades[0]);
  // Follow external value changes (e.g. a class chosen in another picker).
  const [seenValueGrade, setSeenValueGrade] = useState(valueGrade);
  if (valueGrade !== seenValueGrade) {
    setSeenValueGrade(valueGrade);
    if (valueGrade !== undefined) setInnerGrade(valueGrade);
  }
  const shownGrade = grade ?? (innerGrade !== undefined && grades.includes(innerGrade) ? innerGrade : grades[0]);
  const classes = all.filter((c) => c.grade === shownGrade);
  const disabled = new Set(disabledCodes ?? []);

  if (all.length === 0) {
    return <p className={cn("text-sm text-slate-500", className)}>Chưa có lớp nào trong danh mục.</p>;
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {grade === undefined && grades.length > 1 ? (
        <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
          <SegmentedControl<string>
            size="sm"
            ariaLabel="Chọn khối"
            value={String(shownGrade)}
            onChange={(g) => {
              setInnerGrade(Number(g));
              onGradeChange?.(Number(g));
            }}
            options={grades.map((g) => ({ value: String(g), label: gradeLabel(g) }))}
          />
        </div>
      ) : null}
      <div role="group" aria-label={ariaLabel} className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
        {classes.map((c) => {
          const active = c.code === value;
          const isDisabled = disabled.has(c.code);
          return (
            <button
              key={c.code}
              type="button"
              aria-pressed={active}
              disabled={isDisabled}
              title={c.homeroomTeacher ? `GVCN: ${c.homeroomTeacher}` : undefined}
              onClick={() => onChange(c.code)}
              className={cn(
                "relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-control px-2 py-1.5 text-center ring-1 ring-inset transition-[background-color,color,box-shadow] duration-150 ease-soft",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-40",
                active
                  ? "bg-brand-600 text-white shadow-press ring-brand-700"
                  : "bg-surface text-brand-900 ring-border-strong hover:bg-brand-50 hover:ring-brand-300 active:bg-brand-100",
              )}
            >
              {active ? (
                <span aria-hidden className="absolute -right-1.5 -top-1.5 inline-flex size-[18px] items-center justify-center rounded-full bg-star-500 text-brand-950 ring-2 ring-surface">
                  <Check className="size-3" strokeWidth={3.5} />
                </span>
              ) : null}
              <span className="num text-[15px] font-bold leading-5">{c.code}</span>
              {showTeacher && c.homeroomTeacher ? (
                <span className={cn("w-full truncate text-2xs", active ? "text-brand-100" : "text-slate-500")}>{teacherShort(c.homeroomTeacher)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
