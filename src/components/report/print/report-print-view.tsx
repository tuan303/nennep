"use client";
/**
 * The A4 report alone (print page /in/bao-cao/{nonce}, printed to PDF by headless Chromium with JavaScript disabled).
 * A client component so the server page can hand over plain data: ReportDocument / report-sections use the UI kit,
 * whose barrel also exports hooks. Its server-rendered HTML is the whole document – nothing depends on hydration.
 */
import type { PeriodReport } from "../lib/report-model";
import type { ReportPlanContent } from "../lib/report-plan";
import { ReportDocument } from "../report-document";
import { ReportPrintStyles } from "../report-print";

/** Serialisable props (server → client component). */
export interface ReportPrintViewProps {
  report: PeriodReport;
  detail: boolean;
  topRatio: number;
  today: string;
  preparedBy?: string;
  plan: ReportPlanContent;
}

export function ReportPrintView({ report, detail, topRatio, today, preparedBy, plan }: ReportPrintViewProps) {
  return (
    <main className="bg-white py-6 print:py-0">
      <ReportPrintStyles />
      <ReportDocument report={report} detail={detail} topRatio={topRatio} today={today} preparedBy={preparedBy} plan={plan} />
    </main>
  );
}
