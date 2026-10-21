"use client";
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Card, ProgressBar, Tooltip, toneHex } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { EmptyDataHint } from "@/components/app/widgets";
import { fiveS, fiveSCodes, periodLabel } from "@/lib/engine";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { GlobalFilters, LevelDataset, Period } from "@/lib/types";
import { share } from "../lib/view-helpers";
import { MiniStat, RankBubble, RowButton } from "../shared/parts";

export interface FiveSCardProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  /** Total penalty points of the scope (share of 5S). */
  totalPenalty: number;
  context: { period: Period; widened: boolean };
  onOpenClass: (classCode: string) => void;
  className?: string;
}

/** "Theo dõi 5S" (FR-RAG-003): 5S incidents/points of the period, top classes and the weekly trend. */
export function FiveSCard({ ds, filters, today, totalPenalty, context, onOpenClass, className }: FiveSCardProps) {
  const data = useMemo(() => fiveS(ds, filters, today), [ds, filters, today]);
  const trendScope = useMemo<GlobalFilters>(() => ({ ...filters, period: context.period }), [filters, context.period]);
  const trend = useMemo(() => fiveS(ds, trendScope, today).byWeek, [ds, trendScope, today]);
  const codes = useMemo(() => {
    const set = fiveSCodes(ds.catalog);
    return ds.catalog.filter((c) => set.has(c.code));
  }, [ds.catalog]);
  const top = data.byClass.slice(0, 5);
  const max = top[0]?.points ?? 0;
  const hasTrend = trend.some((w) => w.incidents > 0);

  return (
    <Card
      className={className}
      icon={Sparkles}
      title="Theo dõi 5S"
      subtitle={
        <Tooltip
          content={
            codes.length ? (
              <ul className="flex max-w-xs flex-col gap-1">
                {codes.map((c) => (
                  <li key={c.code}>
                    <b>{c.code}</b> · {c.issue}
                  </li>
                ))}
              </ul>
            ) : (
              "Chưa có lỗi nào được gắn nhãn 5S"
            )
          }
        >
          <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
            {fmtNumber(codes.length)} lỗi được tính 5S
          </span>
        </Tooltip>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-border">
          <MiniStat label="Sự việc 5S" value={fmtNumber(data.incidents)} />
          <MiniStat label="Điểm trừ 5S" value={fmtNumber(data.points)} tone="bad" />
          <MiniStat label="Tỷ trọng điểm trừ" value={fmtPercent(share(data.points, totalPenalty))} />
        </div>

        {data.incidents === 0 ? (
          <EmptyDataHint
            ds={ds}
            icon={Sparkles}
            title={ds.incidents.length === 0 ? undefined : "Chưa có lỗi 5S trong kỳ này"}
            description={ds.incidents.length === 0 ? undefined : "Không có sự việc thuộc nhóm lỗi 5S trong phạm vi đang lọc."}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lớp có nhiều lỗi 5S</p>
            <ol className="-mx-2.5 flex flex-col gap-0.5">
              {top.map((c, i) => (
                <li key={c.classCode}>
                  <RowButton onClick={() => onOpenClass(c.classCode)} label={`Xem lớp ${c.classCode}: ${c.incidents} sự việc 5S, ${c.points} điểm trừ`}>
                    <RankBubble n={i + 1} />
                    <span className="w-14 shrink-0 font-semibold text-brand-900">{c.classCode}</span>
                    <ProgressBar value={share(c.points, max)} tone="warn" size="sm" ariaLabel={`${c.points} điểm trừ`} className="flex-1" />
                    <span className="num flex w-20 shrink-0 flex-col items-end leading-4">
                      <span className="text-[13px] font-bold text-bad-strong">{fmtNumber(c.points)} điểm</span>
                      <span className="text-xs text-slate-500">{fmtNumber(c.incidents)} sự việc</span>
                    </span>
                  </RowButton>
                </li>
              ))}
            </ol>
          </div>
        )}

        {hasTrend ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Điểm trừ 5S theo tuần · {periodLabel(context.period, ds.config.semesters)}
            </p>
            <LineChart
              categories={trend.map((w) => w.label)}
              series={[{ name: "Điểm trừ 5S", data: trend.map((w) => w.points), color: toneHex.warn, area: true }]}
              height={150}
              ariaLabel={`Điểm trừ 5S theo tuần: ${trend.map((w) => `${w.label} ${w.points}`).join(", ")}`}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
