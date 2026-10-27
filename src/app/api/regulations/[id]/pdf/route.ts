import { RegulationPdfPutSchema } from "@/lib/contract";
import type { Regulation } from "@/lib/types";
import { isApiError } from "@/lib/server/errors";
import { apiHandler, parseBody } from "@/lib/server/handler";
import {
  deleteRegulationPdf,
  pdfContentDisposition,
  pdfTooLargeError,
  readRegulationPdf,
  REGULATION_PDF_BODY_MAX_BYTES,
  RegulationPdfDeleteSchema,
  regulationIdFromParam,
  saveRegulationPdf,
} from "@/lib/server/regulations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** The original PDF (every signed-in user); 404 when none was uploaded. Never cached: an admin may replace it. */
export const GET = apiHandler<Params>({ permission: "view.dashboard" }, async ({ user, params }) => {
  const { name, data } = await readRegulationPdf(user, regulationIdFromParam(params.id));
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": pdfContentDisposition(name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/** Replace the original PDF (base64, "%PDF-" signature, ≤ REGULATION_PDF_MAX_BYTES → 413); stale `baseRev` → 409. */
export const PUT = apiHandler<Params>({ permission: "regulations.manage" }, async ({ req, user, ip, params }): Promise<Regulation> => {
  const id = regulationIdFromParam(params.id);
  const input = await parseBody(req, RegulationPdfPutSchema, { maxBytes: REGULATION_PDF_BODY_MAX_BYTES }).catch((e: unknown) => {
    // A body above the cap can only carry a file over the limit: say so instead of the generic "quá lớn".
    throw isApiError(e) && e.status === 413 ? pdfTooLargeError() : e;
  });
  return saveRegulationPdf({ user, ip }, id, input);
});

/** Remove the original PDF (JSON body `{ baseRev }`); 404 when there is none. */
export const DELETE = apiHandler<Params>({ permission: "regulations.manage" }, async ({ req, user, ip, params }): Promise<Regulation> => {
  const id = regulationIdFromParam(params.id);
  const input = await parseBody(req, RegulationPdfDeleteSchema);
  return deleteRegulationPdf({ user, ip }, id, input);
});
