"use client";
/**
 * "Bản tóm tắt quyết định" (FR-ACT-001/002, FR-RAG-005): the engine's deterministic DecisionBrief rendered as an
 * executive memo – summary, findings with severity, evidence, impact and recommended actions.
 */
import type { ReactNode } from "react";
import { BookOpenCheck, Copy, Info, Printer } from "lucide-react";
import { Button, Card, cn } from "@/components/ui";
import { RagLegend, copyWithFallback } from "@/components/app/widgets";
import { SCHOOL_NAME } from "@/lib/constants";
import { formatDateVN, type DecisionBrief as Brief } from "@/lib/engine";
import type { ActionItem, LevelConfig } from "@/lib/types";
import { SeverityBadge } from "./action-bits";
import { BriefRecommendations } from "./brief-recommendations";
import type { BriefRecommendation } from "./lib/action-form";
import { BRIEF_DISCLAIMER, briefToText } from "./lib/brief-text";

const SEVERITY_BORDER = { high: "border-l-bad", medium: "border-l-warn", low: "border-l-slate-300" } as const;
/** A whole word that is a number: "25", "1.234", "25,67", "40%", "+12", "−3" (not "6A03"). */
const NUMBER_TOKEN = /^([(“"]*)([+−-]?\d(?:[\d.,/]*\d)?%?)([)”".,;:]*)$/;

/** Evidence line with its stand-alone numbers in bold tabular figures. */
function EmphasizeNumbers({ text }: { text: string }) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((t, i) => {
        const m = NUMBER_TOKEN.exec(t);
        if (!m) return <span key={i}>{t}</span>;
        return (
          <span key={i}>
            {m[1]}
            <strong className="num font-semibold text-brand-900">{m[2]}</strong>
            {m[3]}
          </span>
        );
      })}
    </>
  );
}

function MemoSection({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 break-inside-avoid-page">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="num inline-flex size-6 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-600/15">
          {n}
        </span>
        <h3 className="text-[15px] font-semibold text-brand-900">{title}</h3>
        {aside ? <span className="ml-auto text-xs text-slate-500">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

export interface DecisionBriefCardProps {
  brief: Brief;
  today: string;
  actions?: readonly ActionItem[];
  /** RAG thresholds in force (legend under the findings). */
  ragConfig?: Pick<LevelConfig, "rag">;
  canManage: boolean;
  onCreate: (rec: BriefRecommendation) => void;
  onOpenAction: (item: ActionItem) => void;
}

export function DecisionBriefCard({ brief, today, actions, ragConfig, canManage, onCreate, onOpenAction }: DecisionBriefCardProps) {
  async function copy() {
    await copyWithFallback(briefToText(brief, { today }), {
      success: "Đã sao chép bản tóm tắt",
      successDescription: "Có thể dán vào Zalo, email hoặc văn bản.",
      title: "Sao chép bản tóm tắt",
    });
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-border bg-gradient-to-br from-brand-50 via-surface to-star-50/60 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 gap-3.5">
          <span aria-hidden className="mt-0.5 hidden h-12 w-1.5 shrink-0 rounded-full bg-star-500 sm:block" />
          <div className="min-w-0">
            <p className="text-2xs font-bold uppercase tracking-[0.14em] text-brand-600">Bản tóm tắt quyết định<span className="max-sm:hidden"> · {SCHOOL_NAME}</span></p>
            <h2 className="mt-1 text-lg font-bold leading-snug tracking-tight text-brand-900 sm:text-xl">{brief.title}</h2>
            <p className="num mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-slate-600">
              <span>
                Kỳ: <strong className="font-semibold text-slate-800">{brief.periodLabel}</strong>
              </span>
              <span aria-hidden className="text-slate-300">
                •
              </span>
              <span>Lập ngày {formatDateVN(today)}</span>
              <span aria-hidden className="text-slate-300">
                •
              </span>
              <span className="inline-flex items-center gap-1">
                <BookOpenCheck aria-hidden className="size-3.5" /> Sinh tự động từ dữ liệu
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2" data-print-hide>
          <Button variant="secondary" size="sm" icon={Copy} onClick={() => void copy()}>
            Sao chép
          </Button>
          <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
            In
          </Button>
        </div>
      </header>

      <div className="grid gap-7 px-4 py-5 sm:px-6 sm:py-6 xl:grid-cols-12 xl:gap-8">
        <div className="flex min-w-0 flex-col gap-7 xl:col-span-7">
          <MemoSection n={1} title="Tóm tắt">
            <p className="text-[15px] leading-relaxed text-slate-800">{brief.summary}</p>
          </MemoSection>

          <MemoSection n={2} title="Phát hiện chính" aside={brief.findings.length ? `${brief.findings.length} phát hiện` : undefined}>
            {brief.findings.length === 0 ? (
              <p className="text-sm text-slate-500">Không có phát hiện nổi bật trong kỳ.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {brief.findings.map((f, i) => (
                  <li key={i} className={cn("flex flex-col gap-1.5 rounded-xl border border-l-4 border-border bg-surface px-3.5 py-3", SEVERITY_BORDER[f.severity])}>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-slate-600">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )}
            {ragConfig ? <RagLegend config={ragConfig} className="rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-inset ring-border" /> : null}
          </MemoSection>

          <MemoSection n={3} title="Bằng chứng">
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-slate-700">
              {brief.evidence.map((e, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span className="min-w-0">
                    <EmphasizeNumbers text={e} />
                  </span>
                </li>
              ))}
            </ul>
          </MemoSection>

          <MemoSection n={4} title="Tác động">
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-slate-800 ring-1 ring-inset ring-border">{brief.impact}</p>
          </MemoSection>
        </div>

        <div className="min-w-0 xl:col-span-5">
          <MemoSection n={5} title="Đề xuất hành động" aside={`${brief.recommendations.length} đề xuất`}>
            <BriefRecommendations
              recommendations={brief.recommendations}
              today={today}
              actions={actions}
              canManage={canManage}
              onCreate={onCreate}
              onOpenAction={onOpenAction}
            />
          </MemoSection>
        </div>
      </div>

      <footer className="flex items-start gap-2.5 border-t border-border bg-surface-2 px-4 py-3 text-[13px] leading-5 text-slate-600 sm:px-6">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-500" />
        <p>{BRIEF_DISCLAIMER}</p>
      </footer>
    </Card>
  );
}
