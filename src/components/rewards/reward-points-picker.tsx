"use client";
import { useRef, type KeyboardEvent } from "react";
import { Check, History } from "lucide-react";
import { cn, useFieldControl } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { REWARD_POINT_LEVELS } from "@/lib/constants";

export interface RewardPointsPickerProps {
  /** null = nothing chosen yet. */
  value: number | null;
  onChange: (points: number) => void;
  /** Stored value outside 1–5 of a reward being edited: shown as an extra "+10 (mức cũ)" choice (kept unless changed). */
  legacy?: number;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-describedby"?: string;
}

/**
 * Mức điểm cộng: five large radio buttons +1 … +5 (≥ 44 px, arrow keys move the choice, roving tab stop) and, on edit,
 * the legacy value as an extra choice. The selected button also shows a check mark (never colour alone).
 */
export function RewardPointsPicker({ value, onChange, legacy, disabled, invalid, id, "aria-describedby": describedBy }: RewardPointsPickerProps) {
  const a11y = useFieldControl({ id, "aria-describedby": describedBy, invalid });
  const choices: number[] = [...REWARD_POINT_LEVELS, ...(legacy !== undefined ? [legacy] : [])];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIdx = choices.indexOf(value ?? Number.NaN);
  const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (idx + step + choices.length) % choices.length;
    onChange(choices[next]);
    refs.current[next]?.focus();
  }

  return (
    <div
      id={a11y.id}
      role="radiogroup"
      aria-label="Mức điểm cộng"
      aria-required
      aria-invalid={a11y["aria-invalid"]}
      aria-describedby={a11y["aria-describedby"]}
      className="flex min-w-0 flex-wrap gap-2"
    >
      {choices.map((n, idx) => {
        const checked = n === value;
        const isLegacy = legacy !== undefined && idx === choices.length - 1;
        return (
          <button
            key={`${isLegacy ? "legacy" : "lv"}-${n}`}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={isLegacy ? `+${fmtNumber(n)} điểm (mức cũ, giữ nguyên nếu không đổi)` : `+${n} điểm`}
            tabIndex={idx === focusIdx ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(n)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              "relative inline-flex min-h-12 items-center justify-center gap-1 rounded-control font-bold ring-1 ring-inset transition-[background-color,color,box-shadow] duration-150 ease-soft",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50",
              // Phones: the five levels share one row (basis 0, ≥ 44 px each – 5 × 56 px + gaps would wrap "+5" at 375 px).
              isLegacy ? "px-3 text-sm" : "min-w-11 flex-1 basis-0 px-1 text-lg sm:min-w-14 sm:flex-none sm:basis-auto sm:px-2",
              checked
                ? "bg-ok-strong text-white shadow-press ring-ok-strong"
                : cn("bg-surface text-ok-strong hover:bg-ok-soft", invalid ? "ring-bad/60" : "ring-border-strong hover:ring-ok/50"),
            )}
          >
            {checked ? <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} /> : isLegacy ? <History aria-hidden className="size-4 shrink-0" strokeWidth={2.25} /> : null}
            <span className="num">+{fmtNumber(n)}</span>
            {isLegacy ? <span className="text-xs font-semibold opacity-90">(mức cũ)</span> : null}
          </button>
        );
      })}
    </div>
  );
}
