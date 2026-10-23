"use client";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Award, ArrowRight, ListOrdered, ShieldAlert, type LucideIcon } from "lucide-react";
import { Badge, RagBadge, StatusBadge, buttonClasses, cn } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { KPI_TERMS } from "@/lib/constants";
import { uncountedRewardNote } from "@/components/rewards/lib/reward-list";
import { formatDayMonthVN, rankingRuleOf } from "@/lib/engine";
import type { LevelDataset, Period, RankingRow } from "@/lib/types";
import { IssueBars } from "./issue-bars";
import { classBreakdown } from "./lib/ranking-view";

export interface ClassBreakdownProps {
  ds: LevelDataset;
  row: RankingRow;
  period: Period;
  /** Link target of "Xem chi tiết lớp". */
  detailHref: string;
  className?: string;
}

/** Why a class has its score: equation, key figures, penalties by error and rewards of the period. */
export function ClassBreakdown({ ds, row, period, detailHref, className }: ClassBreakdownProps) {
  const data = useMemo(() => classBreakdown(ds, row.classCode, period), [ds, row.classCode, period]);
  const rule = rankingRuleOf(ds.levelId);

  return (
    <div className={cn("@container", className)}>
      <div className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Equation row={row} />
          <dl className="grid grid-cols-2 gap-2">
            <Stat label={KPI_TERMS.incidents.label} value={fmtNumber(row.incidentCount)} hint={KPI_TERMS.incidents.hint} />
            <Stat label={KPI_TERMS.relatedStudents.label} value={fmtNumber(row.relatedStudentCount)} hint={KPI_TERMS.relatedStudents.hint} />
            <Stat label="Điểm trừ TB/tuần" value={fmtNumber(row.avgWeeklyPenalty)} />
            <Stat label="Độ tin cậy dữ liệu" value={fmtPercent(row.confidence)} warn={row.confidence < ds.config.rag.minConfidence} />
            {rule.tieBreak === "violationTurns" ? (
              <>
                <Stat
                  label={KPI_TERMS.violationTurns.label}
                  value={fmtNumber(row.violationTurns)}
                  hint={`${KPI_TERMS.violationTurns.hint} Bằng điểm: lớp ít lượt vi phạm hơn xếp trên.`}
                />
                <Stat label={rule.scope === "level" ? "Hạng toàn cấp" : "Hạng trong khối"} value={`${fmtNumber(row.rank)}/${fmtNumber(row.gradeClassCount)}`} />
              </>
            ) : null}
          </dl>
          <div className="flex flex-col gap-1.5 text-[13px] text-slate-600">
            <span className="flex flex-wrap items-center gap-2">
              <RagBadge rag={row.rag} size="sm" />
              <span className="num">{row.ragReason}</span>
            </span>
            {data.reviewCount > 0 || data.unnamedCount > 0 ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <ShieldAlert aria-hidden className="size-4 text-warn" strokeWidth={2.25} />
                {data.reviewCount > 0 ? (
                  <Badge tone="bad" size="sm">
                    {fmtNumber(data.reviewCount)} Cần rà soát
                  </Badge>
                ) : null}
                {data.unnamedCount > 0 ? (
                  <Badge tone="warn" size="sm">
                    {fmtNumber(data.unnamedCount)} Thiếu tên HS
                  </Badge>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        <section aria-label={`Điểm trừ theo lỗi của lớp ${row.classCode}`} className="flex min-w-0 flex-col gap-2">
          <Heading icon={ListOrdered}>Điểm trừ theo lỗi</Heading>
          {data.issues.length === 0 ? (
            <p className="rounded-xl bg-ok-soft px-3 py-2.5 text-[13px] text-ok-strong">Chưa có sự việc trong kỳ này.</p>
          ) : (
            <IssueBars issues={data.issues} max={6} />
          )}
        </section>

        <section aria-label={`Điểm thưởng của lớp ${row.classCode}`} className="flex min-w-0 flex-col gap-2 @2xl:col-span-2 @4xl:col-span-1">
          <Heading icon={Award}>Điểm thưởng</Heading>
          {data.counted.length === 0 && data.pending.length === 0 ? (
            <p className="text-[13px] text-slate-500">Chưa có điểm thưởng trong kỳ này.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.counted.map((r) => (
                <RewardLine key={r.id} date={r.date} reason={r.reason} points={r.points} />
              ))}
              {data.pending.map((r) => (
                <RewardLine key={r.id} date={r.date} reason={r.reason} points={r.points} pending={<StatusBadge status={r.status} size="sm" />} />
              ))}
            </ul>
          )}
          {data.pending.length > 0 ? <p className="text-xs text-slate-500">{uncountedRewardNote(ds.config)}</p> : null}
          <Link href={detailHref} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-auto self-start" })} data-print-hide>
            Xem chi tiết lớp
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}

function Equation({ row }: { row: RankingRow }) {
  return (
    <p className="num flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-slate-600 ring-1 ring-inset ring-border">
      <span>
        Điểm nền <strong className="font-semibold text-slate-800">{fmtNumber(row.base)}</strong>
      </span>
      <span aria-hidden>+</span>
      <span>
        thưởng <strong className="font-semibold text-ok-strong">{fmtNumber(row.rewardPoints)}</strong>
      </span>
      <span aria-hidden>−</span>
      <span>
        trừ <strong className="font-semibold text-bad-strong">{fmtNumber(row.penaltyPoints)}</strong>
      </span>
      <span aria-hidden>=</span>
      <strong className="text-[15px] font-bold text-brand-900">{fmtNumber(row.score)}</strong>
    </p>
  );
}

function Stat({ label, value, warn, hint }: { label: string; value: string; warn?: boolean; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-surface px-3 py-2">
      <dt className="truncate text-xs text-slate-500" title={hint}>
        {label}
      </dt>
      <dd className={cn("num text-lg font-bold leading-7", warn ? "text-warn-strong" : "text-brand-900")}>{value}</dd>
    </div>
  );
}

function Heading({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      {children}
    </h4>
  );
}

function RewardLine({ date, reason, points, pending }: { date: string; reason: string; points: number; pending?: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2 text-[13px]", pending && "opacity-75")}>
      <span className="num w-11 shrink-0 pt-px text-xs text-slate-500">{formatDayMonthVN(date)}</span>
      <span className="min-w-0 flex-1 text-slate-700">
        {reason}
        {pending ? <span className="ml-1.5 inline-flex align-middle">{pending}</span> : null}
      </span>
      <span className={cn("num shrink-0 font-semibold", pending ? "text-slate-400 line-through decoration-slate-300" : "text-ok-strong")}>
        +{fmtNumber(points)}
      </span>
    </li>
  );
}
