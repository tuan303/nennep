"use client";
import { ArrowUpRight, CalendarRange, Crown, Target } from "lucide-react";
import { Badge, Card, ErrorState, RagBadge, Skeleton, cn } from "@/components/ui";
import { fmtNumber, fmtPercent, fmtPoints } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";
import type { LevelSummary } from "../lib/school-model";
import { LEVEL_COLOR } from "../lib/school-model";
import { MiniStat, RagStrip } from "../shared/parts";

export interface LevelCardProps {
  summary: LevelSummary;
  minConfidence: number;
  onOpen: (levelId: LevelId) => void;
}

/** One level of the school: KPIs (normalised), RAG distribution, best class and the class needing attention. Click → that level's Tổng quan. */
export function LevelCard({ summary: s, minConfidence, onOpen }: LevelCardProps) {
  const lowConfidence = s.kpis.confidence < minConfidence;
  return (
    <button
      type="button"
      onClick={() => onOpen(s.levelId)}
      aria-label={`Mở Tổng quan ${s.name}: ${s.kpis.incidents} sự việc, ${s.kpis.penaltyPoints} điểm trừ, ${s.rag.RED} lớp mức Đỏ`}
      className={cn(
        "card group relative flex min-w-0 flex-col gap-4 overflow-hidden p-4 text-left sm:p-5",
        "transition-[box-shadow,transform,border-color] duration-200 ease-soft hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: LEVEL_COLOR[s.levelId] }} />
      <span className="flex items-start gap-3">
        <span
          aria-hidden
          className="num inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold text-white shadow-raised"
          style={{ backgroundColor: LEVEL_COLOR[s.levelId] }}
        >
          {s.levelId}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[17px] font-bold leading-6 text-brand-900">{s.name}</span>
          <span className="num text-[13px] text-slate-500">
            {fmtNumber(s.classCount)} lớp
            {typeof s.studentCount === "number" ? ` · ${fmtNumber(s.studentCount)} học sinh` : ""}
          </span>
          <Badge tone="brand" variant="outline" size="sm" icon={CalendarRange} className="mt-0.5 self-start">
            {s.periodLabel}
          </Badge>
        </span>
        <ArrowUpRight
          aria-hidden
          className="size-5 shrink-0 text-slate-300 transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600"
        />
      </span>

      <span className="grid grid-cols-2 gap-x-4 gap-y-3">
        <MiniStat label="Sự việc" value={fmtNumber(s.kpis.incidents)} />
        <MiniStat label="Sự việc / 100 HS" value={s.incidentsPer100 === undefined ? "–" : fmtNumber(s.incidentsPer100, 1)} />
        <MiniStat label="Điểm trừ" value={fmtNumber(s.kpis.penaltyPoints)} tone="bad" />
        <MiniStat label="Điểm trừ / lớp" value={fmtNumber(s.penaltyPerClass, 1)} tone="bad" />
        <MiniStat label="Điểm thưởng" value={fmtNumber(s.kpis.rewardPoints)} tone="star" />
        <MiniStat label="Độ tin cậy dữ liệu" value={fmtPercent(s.kpis.confidence, 1)} tone={lowConfidence ? "bad" : "ok"} />
      </span>

      <span className="flex flex-col gap-2">
        <RagStrip counts={s.rag} total={s.classCount} />
        <span className="flex flex-wrap gap-1.5">
          {(["RED", "YELLOW", "GREEN", "GRAY"] as const)
            .filter((r) => s.rag[r] > 0)
            .map((r) => (
              <span key={r} className="inline-flex items-center gap-1">
                <RagBadge rag={r} compact size="sm" />
                <span className="num text-xs font-semibold text-slate-700">{fmtNumber(s.rag[r])}</span>
              </span>
            ))}
        </span>
      </span>

      <span className="mt-auto grid gap-2 border-t border-border pt-3 text-[13px]">
        <span className="flex items-center gap-2">
          <Crown aria-hidden className="size-4 shrink-0 text-star-600" />
          <span className="text-slate-500">Dẫn đầu:</span>
          {s.best ? (
            <span className="num min-w-0 truncate font-semibold text-brand-900">
              {s.best.classCode} · {fmtNumber(s.best.score)} điểm
            </span>
          ) : (
            <span className="text-slate-500">–</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <Target aria-hidden className="size-4 shrink-0 text-bad" />
          <span className="text-slate-500">Cần chú ý:</span>
          {s.attention ? (
            <span className="num flex min-w-0 items-center gap-1.5 truncate font-semibold text-brand-900">
              {s.attention.classCode} · {fmtPoints(-s.attention.penaltyPoints)}
              {s.attention.rag === "RED" || s.attention.rag === "YELLOW" ? <RagBadge rag={s.attention.rag} compact size="sm" /> : null}
            </span>
          ) : (
            <span className="text-ok-strong">Không có lớp đáng lo ngại</span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Placeholder while a level loads / failed. */
export function LevelCardPlaceholder({ levelId, error, onRetry, retrying }: { levelId: LevelId; error?: string; onRetry: () => void; retrying: boolean }) {
  if (error) {
    return (
      <Card padding="none" title={LEVELS[levelId].name}>
        <ErrorState size="sm" message={error} onRetry={onRetry} retrying={retrying} />
      </Card>
    );
  }
  return (
    <div className="card flex flex-col gap-4 p-4 sm:p-5" role="status" aria-label={`Đang tải ${LEVELS[levelId].name}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      <Skeleton className="h-3 w-full rounded-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
