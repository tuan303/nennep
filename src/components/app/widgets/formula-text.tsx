"use client";
import { Calculator } from "lucide-react";
import { cn } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { formulaInputOf, pointsFormula, type FormulaIncident, type FormulaInput } from "./lib/points-formula";

export type FormulaTextProps = {
  /** Second line "2 HS có tên + 1 HS chưa rõ tên" when some students are unnamed (default true). */
  showNote?: boolean;
  /** Leading calculator icon (default false). */
  icon?: boolean;
  className?: string;
} & (
  | { /** Stored incident: uses its points as the total. */ incident: FormulaIncident & { points: number } }
  | { /** Draft values (live preview in forms). */ input: FormulaInput; total?: number }
);

/** Points formula, e.g. "2 điểm × 3 HS = 6" or "5 điểm × 2 lần = 10" (BR-POINT-01/02). */
export function FormulaText(props: FormulaTextProps) {
  const { showNote = true, icon, className } = props;
  const f = "incident" in props ? pointsFormula(formulaInputOf(props.incident), props.incident.points) : pointsFormula(props.input, props.total);
  const [lhs] = f.text.split(" = ");
  return (
    <span className={cn("inline-flex min-w-0 flex-col gap-0.5", className)}>
      <span className="num inline-flex items-center gap-1.5 text-slate-700">
        {icon ? <Calculator aria-hidden className="size-3.5 shrink-0 text-slate-400" strokeWidth={2.25} /> : null}
        <span>
          {lhs} = <strong className="font-bold text-brand-900">{fmtNumber(f.total)}</strong>
        </span>
      </span>
      {showNote && f.note ? <span className="num text-xs text-slate-500">{f.note}</span> : null}
    </span>
  );
}
