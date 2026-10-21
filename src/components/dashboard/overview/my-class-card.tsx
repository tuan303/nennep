"use client";
import { ArrowUpRight, Star } from "lucide-react";
import { RagBadge, StarPoint, Top90Badge, cn } from "@/components/ui";
import { fmtNumber, fmtPoints } from "@/lib/client/format";
import type { RankingRow } from "@/lib/types";

export interface MyClassCardProps {
  rows: RankingRow[];
  periodText: string;
  /** config.top90Ratio of the level (Top badge label). */
  topRatio?: number;
  onOpenClass: (classCode: string) => void;
  className?: string;
}

/** GVCN only: own class(es) with rank, RAG and points for the selected period (navy brand band). */
export function MyClassCard({ rows, periodText, topRatio, onOpenClass, className }: MyClassCardProps) {
  if (rows.length === 0) return null;
  return (
    <section
      aria-label="Lớp của tôi"
      className={cn("relative overflow-hidden rounded-card bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-4 text-white shadow-raised sm:p-5", className)}
    >
      <div aria-hidden className="bg-stars absolute inset-0 opacity-60" />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <StarPoint className="size-5" />
          <h2 className="text-[15px] font-semibold text-white">Lớp của tôi</h2>
          <span className="text-[13px] text-white/70">· {periodText}</span>
        </div>
        <ul className={cn("grid gap-3", rows.length > 1 && "md:grid-cols-2")}>
          {rows.map((r) => (
            <li key={r.classCode}>
              <button
                type="button"
                onClick={() => onOpenClass(r.classCode)}
                aria-label={`Xem chi tiết lớp ${r.classCode}: hạng ${r.rank}/${r.gradeClassCount} khối ${r.grade}, điểm thi đua ${r.score}`}
                className="group flex w-full flex-col gap-3 rounded-xl bg-white/[0.07] p-3.5 text-left ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-star-400 sm:flex-row sm:items-center"
              >
                <span className="flex items-center gap-3">
                  <span className="num inline-flex h-12 min-w-16 items-center justify-center rounded-xl bg-white px-3 text-xl font-extrabold text-brand-900">
                    {r.classCode}
                  </span>
                  <span className="flex flex-col">
                    <span className="num text-sm font-semibold">
                      Hạng {fmtNumber(r.rank)}/{fmtNumber(r.gradeClassCount)} khối {r.grade}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <RagBadge rag={r.rag} compact size="sm" />
                      <Top90Badge inTop90={r.inTop90} ratio={topRatio} size="sm" />
                    </span>
                  </span>
                </span>
                <span className="num grid flex-1 grid-cols-3 gap-2 sm:ml-auto sm:max-w-sm">
                  <Metric label="Thi đua" value={fmtNumber(r.score)} strong />
                  <Metric label="Điểm trừ" value={fmtPoints(-r.penaltyPoints)} />
                  <Metric label="Điểm thưởng" value={fmtPoints(r.rewardPoints)} />
                </span>
                <ArrowUpRight aria-hidden className="hidden size-5 shrink-0 text-white/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block" />
              </button>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 text-xs text-white/70">
          <Star aria-hidden className="size-3.5" />
          Lớp của thầy/cô cũng được tô vàng trong các danh sách bên dưới.
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-2xs font-medium uppercase tracking-wide text-white/70">{label}</span>
      <span className={cn("text-lg font-bold leading-6", strong ? "text-star-400" : "text-white")}>{value}</span>
    </span>
  );
}
