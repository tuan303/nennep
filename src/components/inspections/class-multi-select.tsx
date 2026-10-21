"use client";
import { useMemo } from "react";
import { Check, CheckCheck, X } from "lucide-react";
import { Button, Checkbox, cn, useFieldControl } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { ClassInfo } from "@/lib/types";
import { gradeSelectionState, selectableClassGroups, setAllSelected, setGradeSelected, toggleClass } from "./lib/inspection-form";

export interface ClassMultiSelectProps {
  classes: readonly ClassInfo[];
  value: readonly string[];
  onChange: (codes: string[]) => void;
  /** Classes already on the record (kept selectable even if deactivated since). */
  keep?: readonly string[];
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

/**
 * Lớp được kiểm tra: tap grid grouped by Khối, "Chọn cả khối" per grade, "Chọn tất cả" / "Bỏ chọn" and a counter.
 * Every class is a toggle button ≥ 44 px (aria-pressed); the selected state also shows a check mark (never colour alone).
 */
export function ClassMultiSelect({ classes, value, onChange, keep, disabled, invalid, id }: ClassMultiSelectProps) {
  const a11y = useFieldControl({ id, invalid });
  const groups = useMemo(() => selectableClassGroups(classes, keep), [classes, keep]);
  const total = groups.reduce((n, g) => n + g.classes.length, 0);
  const selected = new Set(value);
  const count = groups.reduce((n, g) => n + g.classes.filter((c) => selected.has(c.code)).length, 0);

  if (total === 0) return <p className="text-sm text-slate-500">Chưa có lớp nào đang hoạt động trong danh mục.</p>;

  return (
    <div
      id={a11y.id}
      role="group"
      aria-label="Lớp được kiểm tra"
      aria-describedby={a11y["aria-describedby"]}
      aria-invalid={a11y["aria-invalid"]}
      className={cn("flex min-w-0 flex-col gap-3 rounded-card p-0.5", a11y["aria-invalid"] && "ring-2 ring-bad/40")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="num mr-auto text-[13px] text-slate-600" aria-live="polite">
          Đã chọn <strong className="text-base font-bold text-brand-900">{fmtNumber(count)}</strong>/{fmtNumber(total)} lớp
        </p>
        <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => onChange(setAllSelected(groups, true))} disabled={disabled || count === total}>
          Chọn tất cả
        </Button>
        <Button size="sm" variant="ghost" icon={X} onClick={() => onChange(setAllSelected(groups, false))} disabled={disabled || count === 0}>
          Bỏ chọn
        </Button>
      </div>
      {groups.map((g) => {
        const state = gradeSelectionState(value, g);
        const inGrade = g.classes.filter((c) => selected.has(c.code)).length;
        return (
          <fieldset key={g.grade} className="min-w-0 rounded-control border border-border bg-surface px-3 pb-3 pt-1" disabled={disabled}>
            <legend className="sr-only">{g.label}</legend>
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <Checkbox
                checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                onChange={(on) => onChange(setGradeSelected(value, g, on))}
                disabled={disabled}
                label={
                  <span>
                    {g.label} <span className="font-normal text-slate-500">· Chọn cả khối</span>
                  </span>
                }
              />
              <span className="num text-xs text-slate-500">
                {inGrade}/{g.classes.length} lớp
              </span>
            </div>
            <div role="group" aria-label={`Lớp ${g.label}`} className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
              {g.classes.map((c) => {
                const on = selected.has(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    aria-pressed={on}
                    title={c.homeroomTeacher ? `GVCN: ${c.homeroomTeacher}` : undefined}
                    onClick={() => onChange(toggleClass(value, c.code))}
                    className={cn(
                      "relative flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-control px-2 text-center ring-1 ring-inset transition-[background-color,color,box-shadow] duration-150 ease-soft",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50",
                      on
                        ? "bg-acc-fill text-acc-on shadow-press ring-acc-fill"
                        : "bg-surface text-brand-900 ring-border-strong hover:bg-brand-50 hover:ring-brand-300 active:bg-brand-100",
                    )}
                  >
                    {on ? <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={3} /> : null}
                    <span className="num text-[15px] font-bold leading-5">{c.code}</span>
                    {!c.active ? <span className="sr-only">(ngừng hoạt động)</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
