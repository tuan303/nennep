/** Print-only pieces of the Báo GVCN page: scoped A4 stylesheet and the signature block. */

/** Attribute that scopes the print rules to the report document. */
export const REPORT_ATTR = "data-gvcn-report";

const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm 10mm 14mm; }
@media print {
  [${REPORT_ATTR}] { gap: 10px !important; }
  [${REPORT_ATTR}] .overflow-x-auto, [${REPORT_ATTR}] .overflow-auto { overflow: visible !important; max-height: none !important; }
  [${REPORT_ATTR}] table { font-size: 9pt; width: 100%; }
  [${REPORT_ATTR}] th, [${REPORT_ATTR}] td { padding: 4px 6px !important; white-space: normal !important; vertical-align: top !important; height: auto !important; }
  [${REPORT_ATTR}] tr { break-inside: avoid; page-break-inside: avoid; }
  [${REPORT_ATTR}] li { break-inside: avoid; page-break-inside: avoid; }
  [${REPORT_ATTR}] .line-clamp-2, [${REPORT_ATTR}] .line-clamp-3 { -webkit-line-clamp: unset !important; display: block !important; overflow: visible !important; }
  [${REPORT_ATTR}] .card { border: 1px solid #cbd5e1 !important; }
  [${REPORT_ATTR}] [data-print-flow] { break-inside: auto !important; }
}
`;

/** Scoped print stylesheet (rendered only while the report page is mounted). */
export function ReportPrintStyles() {
  return <style>{PRINT_CSS}</style>;
}

/** Signature lines at the bottom of the printed report. */
export function PrintSignatures({ homeroomTeacher }: { homeroomTeacher?: string }) {
  return (
    <div className="hidden break-inside-avoid grid-cols-2 gap-8 pt-6 text-center text-sm text-slate-800 print:grid">
      <div className="flex flex-col gap-1">
        <p className="font-bold">Người lập báo cáo</p>
        <p className="text-xs italic text-slate-500">(Ký, ghi rõ họ tên)</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-bold">Giáo viên chủ nhiệm</p>
        <p className="text-xs italic text-slate-500">(Ký, ghi rõ họ tên)</p>
        {homeroomTeacher ? <p className="mt-16 font-semibold">{homeroomTeacher}</p> : null}
      </div>
    </div>
  );
}
