import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { reportFileBase } from "@/components/report/lib/report-export";
import { ReportPrintView } from "@/components/report/print/report-print-view";
import { readPrintJobForPage } from "@/lib/server/mail/print-jobs";
import { loadReportForJob, type LoadedReport } from "@/lib/server/mail/report-data";

/**
 * /in/bao-cao/{nonce} – the A4 report of a print job, printed to PDF by headless Chromium (src/lib/server/mail/pdf.ts).
 * Outside the signed-in (app) group: no session, the unguessable short-lived nonce is the authorisation. The content
 * is built server-side with the rights of the job's viewer (loadReportForJob, same rules as the report screen);
 * anything missing, expired or no longer allowed → 404. A forged nonce is rejected before any Firestore read (its MAC
 * does not match); a valid one is loaded at most PRINT_NONCE_RATE times (readPrintJobForPage). No per-address limit:
 * our own Chromium – every drain and "Tải PDF" – comes from one server address. White page, no shell; never indexed
 * or cached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ job: string }> };

/** One load per request (generateMetadata + page). */
const loadPrint = cache(async (nonce: string): Promise<LoadedReport | undefined> => {
  const job = await readPrintJobForPage(nonce);
  if (!job) return undefined;
  const loaded = await loadReportForJob(job.spec);
  return loaded.ok ? loaded.data : undefined;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadPrint((await params).job);
  return {
    // The PDF title: the same base name as "In / Lưu PDF" on the report screen.
    title: data ? { absolute: reportFileBase(data.report) } : "Báo cáo nền nếp",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ReportPrintPage({ params }: Props) {
  const data = await loadPrint((await params).job);
  if (!data) notFound();
  return (
    <ReportPrintView report={data.report} detail={data.detail} topRatio={data.topRatio} today={data.today} preparedBy={data.preparedBy} plan={data.plan} />
  );
}
