import { ReportPdfQuerySchema } from "@/lib/contract";
import { apiHandler, parseQuery } from "@/lib/server/handler";
import { pdfAttachmentDisposition, reportPdfForUser } from "@/lib/server/mail/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Headless Chromium renders the PDF within the request (budget ~55 s, see report-pdf.ts). 300 like every other route
 * that bundles Chromium (PDF_ROUTES in next.config.ts): Vercel merges routes with the same function configuration into
 * one function, so this value keeps Chromium out of the 60 s routes (incidents, rewards, …).
 */
export const maxDuration = 300;

/** "Tải PDF": the A4 report of ?level&mode&key&to&detail as a PDF download (same rules as the report screen). */
export const GET = apiHandler({ permission: "view.dashboard" }, async ({ req, user }) => {
  const query = parseQuery(req, ReportPdfQuerySchema);
  const { pdf, fileName } = await reportPdfForUser(user, query, req.nextUrl.origin);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": pdfAttachmentDisposition(fileName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
