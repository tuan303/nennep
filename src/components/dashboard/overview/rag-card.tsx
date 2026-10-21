"use client";
import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { Card, Pill, RagBadge, cn } from "@/components/ui";
import { RagLegend } from "@/components/app/widgets";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { GradeRanking, LevelDataset, RagStatus } from "@/lib/types";
import { RAG_ORDER, ragSummary } from "../lib/overview-model";
import { RagStrip } from "../shared/parts";

export interface RagCardProps {
  ds: LevelDataset;
  ranking: { countedWeeks: number; grades: GradeRanking[] };
  grade?: number;
  onOpenClass: (classCode: string) => void;
  className?: string;
}

const TILE_RING: Record<RagStatus, string> = {
  RED: "ring-bad/20 bg-bad-soft/60",
  YELLOW: "ring-warn/25 bg-warn-soft/70",
  GREEN: "ring-ok/20 bg-ok-soft/60",
  GRAY: "ring-slate-400/25 bg-muted-soft/70",
};

/** "Tình trạng lớp (RAG)": counts over the ranking population of the period + the classes at Đỏ/Vàng. */
export function RagCard({ ds, ranking, grade, onOpenClass, className }: RagCardProps) {
  const summary = useMemo(() => ragSummary(ranking.grades, grade), [ranking, grade]);
  const flagged = summary.rows.filter((r) => r.rag === "RED" || r.rag === "YELLOW").slice(0, 8);
  const scope = typeof grade === "number" ? `Khối ${grade}` : "Toàn cấp";

  return (
    <Card
      className={className}
      icon={Gauge}
      title="Tình trạng lớp (RAG)"
      subtitle={`${scope} · ${fmtNumber(summary.total)} lớp · ${fmtNumber(ranking.countedWeeks)} tuần tính thi đua`}
    >
      <div className="flex flex-col gap-4">
        <RagStrip counts={summary.counts} total={summary.total} />
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-2">
          {RAG_ORDER.map((rag) => (
            <li key={rag} className={cn("flex flex-col gap-1.5 rounded-xl p-3 ring-1 ring-inset", TILE_RING[rag])}>
              <RagBadge rag={rag} compact size="sm" className="self-start" />
              <p className="num flex items-baseline gap-1.5">
                <span className="text-2xl font-bold leading-7 text-brand-900">{fmtNumber(summary.counts[rag])}</span>
                <span className="text-xs text-slate-500">lớp · {fmtPercent(summary.total ? summary.counts[rag] / summary.total : 0)}</span>
              </p>
            </li>
          ))}
        </ul>

        {summary.highlighted ? (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
            Lớp đang lọc <span className="font-semibold text-brand-900">{summary.highlighted.classCode}</span>
            <RagBadge rag={summary.highlighted.rag} reason={summary.highlighted.ragReason} size="sm" />
          </p>
        ) : null}

        {flagged.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lớp cần chú ý</p>
            <div className="flex flex-wrap gap-2">
              {flagged.map((r) => (
                <Pill
                  key={r.classCode}
                  onClick={() => onOpenClass(r.classCode)}
                  title={r.ragReason}
                  aria-label={`Lớp ${r.classCode}, ${r.rag === "RED" ? "mức Đỏ" : "mức Vàng"}: ${r.ragReason}`}
                >
                  <span className="num inline-flex items-center gap-1.5">
                    <span aria-hidden className={cn("size-2 rounded-full", r.rag === "RED" ? "bg-bad" : "bg-warn-fill ring-1 ring-warn/50")} />
                    <span className="font-semibold">{r.classCode}</span>
                    <span className="text-slate-500">{fmtNumber(r.avgWeeklyPenalty)} điểm/tuần</span>
                  </span>
                </Pill>
              ))}
            </div>
          </div>
        ) : ds.config.rag.approved ? (
          <p className="text-[13px] text-ok-strong">Không có lớp ở mức Vàng hoặc Đỏ trong kỳ này.</p>
        ) : null}

        <div className="border-t border-border pt-3">
          <RagLegend config={ds.config} layout="list" />
        </div>
      </div>
    </Card>
  );
}
