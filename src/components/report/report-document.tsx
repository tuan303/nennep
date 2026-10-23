/**
 * The A4 report document (REQ_V2 §6.5): school header, title, addressee, KPI block, ranking of the scope, top issues +
 * groups, early warnings, optional detail register and signatures. Screen = preview of the printed page.
 */
import { LogoMark } from "@/components/app/shell/logo";
import { fmtNumber } from "@/lib/client/format";
import { SCHOOL_NAME } from "@/lib/constants";
import { formatDateVN } from "@/lib/engine/dates";
import { previousPeriodNoun } from "../ranking/lib/ranking-view";
import type { PeriodReport } from "./lib/report-model";
import { REPORT_DOC_ATTR, ReportSignatures } from "./report-print";
import { DetailBlock, IssuesBlock, KpiBlock, RankingBlock, ReportSection, ScoreBandLegend, WarningsBlock } from "./report-sections";

export interface ReportDocumentProps {
  report: PeriodReport;
  /** Include the detail register (Chi tiết sự việc). */
  detail: boolean;
  /** config.top90Ratio of the level. */
  topRatio: number;
  /** yyyy-mm-dd of the generation. */
  today: string;
  /** "Người lập báo cáo" (display name of the viewer). */
  preparedBy?: string;
}

export function ReportDocument({ report, detail, topRatio, today, preparedBy }: ReportDocumentProps) {
  const previousNoun = report.previousLabel ? previousPeriodNoun(report.period.mode) : undefined;
  let index = 0;
  const next = () => ++index;
  return (
    <article
      {...{ [REPORT_DOC_ATTR]: "" }}
      aria-label={`${report.title} – ${report.addressee}`}
      className="mx-auto flex w-full max-w-[210mm] flex-col gap-5 rounded-card border border-border bg-white p-4 text-slate-900 shadow-card sm:p-8"
    >
      <header data-keep className="flex items-start justify-between gap-4 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size="lg" label={SCHOOL_NAME} />
          <div className="min-w-0">
            <p className="text-[13px] font-bold uppercase tracking-wide text-brand-900">{SCHOOL_NAME.toLocaleUpperCase("vi-VN")}</p>
            <p className="text-xs text-slate-600">Cấp {report.levelName}</p>
          </div>
        </div>
        <p className="num shrink-0 text-right text-xs text-slate-500">
          Ngày lập
          <br />
          <span className="font-semibold text-slate-700">{formatDateVN(today)}</span>
        </p>
      </header>

      <div data-keep className="flex flex-col items-center gap-1 text-center">
        <h1 className="num text-[17px] font-bold leading-6 text-brand-900 sm:text-[19px]">{report.title}</h1>
        <p className="text-[13.5px] text-slate-800">
          <span className="font-semibold">Kính gửi:</span> {report.addressee}
        </p>
        {report.previousLabel ? <p className="num text-xs text-slate-500">So sánh với: {report.previousLabel}</p> : null}
      </div>

      <ReportSection index={next()} title="Chỉ số chính" note={`Phạm vi: ${report.scopeLabel}.`}>
        <KpiBlock kpis={report.kpis} previousNoun={previousNoun} />
        <ul className="flex flex-col gap-0.5 text-2xs leading-4 text-slate-500">
          {report.kpis
            .filter((k) => k.id !== "rewardPoints")
            .map((k) => (
              <li key={k.id}>
                <span className="font-semibold text-slate-600">{k.label}:</span> {k.hint}
              </li>
            ))}
        </ul>
      </ReportSection>

      <ReportSection
        index={next()}
        title="Xếp hạng thi đua"
        note={`${fmtNumber(report.ranking.countedWeeks)} tuần tính thi đua trong kỳ · thứ hạng tính trên toàn bộ lớp của khối.`}
      >
        <RankingBlock ranking={report.ranking} topRatio={topRatio} previousNoun={previousNoun} />
        <ScoreBandLegend ranking={report.ranking} />
      </ReportSection>

      <ReportSection index={next()} title="Vấn đề nổi bật">
        <IssuesBlock issues={report.topIssues} groups={report.groups} />
      </ReportSection>

      <ReportSection index={next()} title="Cảnh báo sớm">
        <WarningsBlock warnings={report.warnings} />
      </ReportSection>

      {detail ? (
        <ReportSection index={next()} title="Chi tiết sự việc" note={`${fmtNumber(report.detail.length)} sự việc, xếp theo ngày và mã sự việc.`}>
          <DetailBlock rows={report.detail} />
        </ReportSection>
      ) : null}

      <ReportSignatures preparedBy={preparedBy} />
    </article>
  );
}
