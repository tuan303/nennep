/** Print-only pieces of the weekly / monthly report: the scoped A4 stylesheet and the signature block. */

/** Attribute that scopes the print rules to the report document. */
export const REPORT_DOC_ATTR = "data-report-doc";

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  #main-content { padding: 0 !important; max-width: none !important; }
  [${REPORT_DOC_ATTR}] { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; width: 100% !important; font-size: 10pt; }
  [${REPORT_DOC_ATTR}] section { break-inside: auto; }
  [${REPORT_DOC_ATTR}] [data-keep] { break-inside: avoid; page-break-inside: avoid; }
  [${REPORT_DOC_ATTR}] h2 { break-after: avoid; page-break-after: avoid; }
  [${REPORT_DOC_ATTR}] .overflow-x-auto { overflow: visible !important; }
  [${REPORT_DOC_ATTR}] table { width: 100%; font-size: 8.5pt; }
  [${REPORT_DOC_ATTR}] th, [${REPORT_DOC_ATTR}] td { padding: 3px 4px !important; vertical-align: top !important; white-space: normal !important; }
  [${REPORT_DOC_ATTR}] thead { display: table-header-group; }
  [${REPORT_DOC_ATTR}] tr, [${REPORT_DOC_ATTR}] li { break-inside: avoid; page-break-inside: avoid; }
}
`;

/** Scoped print stylesheet (rendered only while the report page is mounted). */
export function ReportPrintStyles() {
  return <style>{PRINT_CSS}</style>;
}

/** "Người lập báo cáo" / "Xác nhận của BGH" (shown on screen too: the document is a preview of the printed page). */
export function ReportSignatures({ preparedBy }: { preparedBy?: string }) {
  return (
    <div data-keep className="grid grid-cols-2 gap-8 pt-8 text-center text-[13px] text-slate-800">
      <div className="flex flex-col gap-1">
        <p className="font-bold">Người lập báo cáo</p>
        <p className="text-xs italic text-slate-500">(Ký, ghi rõ họ tên)</p>
        <p className="mt-16 min-h-5 font-semibold">{preparedBy ?? ""}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-bold">Xác nhận của BGH</p>
        <p className="text-xs italic text-slate-500">(Ký, ghi rõ họ tên)</p>
      </div>
    </div>
  );
}
