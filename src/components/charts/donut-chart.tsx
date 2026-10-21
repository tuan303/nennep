"use client";

import { useMemo, type ReactNode } from "react";
import { ChartPie } from "lucide-react";
import { cn } from "../ui/cn";
import { formatNumberVN, formatPercentVN } from "../ui/format";
import { EmptyState } from "../ui/states";
import { EChart, type ChartEventHandlers } from "./echart";
import { buildDonutOption, donutTotal, type DonutDatum, type ValueFormatter } from "./options";
import { chartColor } from "./theme";

export interface DonutChartProps {
  data: DonutDatum[];
  /** Small text in the hole (e.g. "Sự việc"). */
  centerLabel?: string;
  /** Big text in the hole (default: total). */
  centerValue?: ReactNode;
  /** Diameter of the ring in px (default 200). */
  height?: number;
  valueFormatter?: ValueFormatter;
  /** "side" = legend right of the ring when there is room (container ≥ 28rem), else below. */
  legend?: "side" | "bottom" | "none";
  onSliceClick?: (name: string) => void;
  ariaLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  className?: string;
}

/** Share of a whole (≤ 8 slices; fold the tail into "Khác"). HTML legend with value + percentage. */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  height = 200,
  valueFormatter = formatNumberVN,
  legend = "side",
  onSliceClick,
  ariaLabel,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Không có số liệu trong phạm vi đang lọc.",
  loading,
  className,
}: DonutChartProps) {
  const total = donutTotal(data);
  const dataKey = JSON.stringify(data);
  const colored = useMemo(() => data.map((d, i) => ({ ...d, color: d.color ?? chartColor(i) })), [dataKey]);
  const option = useMemo(() => buildDonutOption(colored, valueFormatter), [colored, valueFormatter]);
  const onEvents = useMemo<ChartEventHandlers | undefined>(
    () => (onSliceClick ? { click: (p) => onSliceClick(p.name) } : undefined),
    [onSliceClick],
  );

  if (!loading && total <= 0) {
    return <EmptyState size="sm" icon={ChartPie} title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const label =
    ariaLabel ??
    `Biểu đồ tròn: ${colored.map((d) => `${d.name} ${formatPercentVN(total ? d.value / total : 0)}`).join(", ")}`;

  return (
    <div className={cn("@container w-full min-w-0", className)}>
      <div className={cn("flex flex-col items-center gap-5", legend === "side" && "@md:flex-row @md:items-center @md:gap-6")}>
        <div className="relative shrink-0" style={{ width: height, height, maxWidth: "100%" }}>
          <EChart option={option} height={height} ariaLabel={label} onEvents={onEvents} loading={loading} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="num text-2xl font-bold leading-tight tracking-tight text-brand-900">{centerValue ?? valueFormatter(total)}</span>
            {centerLabel ? <span className="mt-0.5 max-w-[60%] text-xs font-medium leading-4 text-slate-500">{centerLabel}</span> : null}
          </div>
        </div>
        {legend !== "none" ? (
          <ul className="grid w-full min-w-0 flex-1 gap-1">
            {colored.map((d) => {
              const pct = total ? d.value / total : 0;
              const row = (
                <>
                  <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: d.color }} />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
                  <span className="num shrink-0 font-semibold text-slate-900">{valueFormatter(d.value)}</span>
                  <span className="num w-12 shrink-0 text-right text-xs text-slate-500">{formatPercentVN(pct)}</span>
                </>
              );
              return (
                <li key={d.name}>
                  {onSliceClick ? (
                    <button
                      type="button"
                      onClick={() => onSliceClick(d.name)}
                      className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:min-h-11"
                    >
                      {row}
                    </button>
                  ) : (
                    <div className="flex min-h-8 items-center gap-2.5 px-2 text-[13px]">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
