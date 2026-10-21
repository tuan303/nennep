"use client";
import { useState, type ReactNode } from "react";
import { Calculator, ChevronDown, Clock, Filter, Highlighter, PartyPopper, Star, type LucideIcon } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { PeriodBadge, RagLegend } from "@/components/app/widgets";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { LevelConfig, Period } from "@/lib/types";

export interface RankingExplainerProps {
  config: LevelConfig;
  period: Period;
  countedWeeks: number;
  /** The period contains the week in progress. */
  inProgress: boolean;
  /** Class highlighted by the global filter (population unchanged). */
  highlightClass?: string;
  /** A category / error / group / student filter is active (ignored by the ranking). */
  issueFilterActive: boolean;
  /** No incident and no counted reward in the period: every class is tied at the base score. */
  quiet?: boolean;
}

/** Subtle strip explaining how the ranking is computed (period, base score, formula, Top 90% rule, RAG thresholds). */
export function RankingExplainer({ config, period, countedWeeks, inProgress, highlightClass, issueFilterActive, quiet }: RankingExplainerProps) {
  const [open, setOpen] = useState(false);
  const base = config.baseScorePerWeek * countedWeeks;
  const statuses = config.rewardCountedStatuses.map((s) => s.toLowerCase()).join(", ");
  return (
    <Card padding="none" className="overflow-hidden bg-gradient-to-br from-brand-50/70 via-surface to-surface">
      <div className="flex flex-col gap-3 p-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PeriodBadge period={period} semesters={config.semesters} />
          <span className="num text-sm text-slate-700">
            <strong className="font-semibold text-brand-900">{fmtNumber(countedWeeks)}</strong> tuần tính điểm
          </span>
          <span aria-hidden className="hidden h-4 w-px bg-border-strong sm:block" />
          <span className="num text-sm text-slate-700">
            Điểm nền = {fmtNumber(config.baseScorePerWeek)} × {fmtNumber(countedWeeks)} tuần ={" "}
            <strong className="font-semibold text-brand-900">{fmtNumber(base)}</strong>
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="ranking-rules"
            data-print-hide
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:h-11 sm:hidden"
          >
            Cách tính
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        {countedWeeks === 0 ? (
          <Note icon={Clock} tone="warn">
            Kỳ đang chọn chưa có tuần nào được tính thi đua (tuần nghỉ hoặc chưa diễn ra) nên điểm nền bằng 0.
          </Note>
        ) : inProgress ? (
          <Note icon={Clock}>Kỳ này gồm tuần đang diễn ra – điểm và thứ hạng còn có thể thay đổi.</Note>
        ) : null}
        {quiet && countedWeeks > 0 ? (
          <Note icon={PartyPopper} tone="ok">
            Chưa có sự việc trong kỳ này – các lớp đang cùng điểm nền và đồng hạng.
          </Note>
        ) : null}
        {highlightClass ? (
          <Note icon={Highlighter}>
            Lớp <strong className="font-semibold text-brand-900">{highlightClass}</strong> đang được làm nổi bật; thứ hạng vẫn tính trên toàn bộ các
            lớp của khối.
          </Note>
        ) : null}
        {issueFilterActive ? <Note icon={Filter}>Bộ lọc mảng, nhóm lỗi, lỗi và học sinh không áp dụng cho xếp hạng – điểm thi đua luôn tính mọi lỗi.</Note> : null}

        <div
          id="ranking-rules"
          className={cn("grid gap-3 border-t border-border/80 pt-3 sm:grid sm:grid-cols-2 xl:grid-cols-3", open ? "grid" : "hidden")}
        >
          <Rule icon={Calculator} title="Công thức">
            Điểm thi đua = Điểm nền + Điểm thưởng ({statuses}) − Điểm trừ. Điểm có thể âm.
          </Rule>
          <Rule icon={Star} title={`Top ${fmtPercent(config.top90Ratio)}`}>
            Ngưỡng = làm tròn lên {fmtPercent(config.top90Ratio)} số lớp của khối; các lớp đồng hạng tại ngưỡng đều Thuộc Top{" "}
            {fmtPercent(config.top90Ratio)}.
          </Rule>
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mức cảnh báo (điểm trừ TB/tuần)</p>
            <RagLegend config={config} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Rule({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
        <Icon aria-hidden className="size-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <p className="num text-[13px] leading-5 text-slate-700">{children}</p>
      </div>
    </div>
  );
}

const NOTE_TEXT = { brand: "text-slate-600", warn: "text-warn-strong", ok: "text-ok-strong" } as const;
const NOTE_ICON = { brand: "text-brand-500", warn: "text-warn", ok: "text-ok" } as const;

function Note({ icon: Icon, tone = "brand", children }: { icon: LucideIcon; tone?: "brand" | "warn" | "ok"; children: ReactNode }) {
  return (
    <p className={cn("flex items-start gap-2 text-[13px] leading-5", NOTE_TEXT[tone])}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", NOTE_ICON[tone])} strokeWidth={2.25} />
      <span>{children}</span>
    </p>
  );
}
