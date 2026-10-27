/** Print-only pieces of the quy chế page: the scoped A4 stylesheet and "print with a file name". */
import { REGULATION_DOC_ATTR } from "./regulation-body";

const DOC = `[${REGULATION_DOC_ATTR}]`;

const PRINT_CSS = `
@page { size: A4; margin: 15mm 15mm 16mm; }
@media print {
  #main-content { padding: 0 !important; max-width: none !important; }
  ${DOC} { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; width: 100% !important; font-size: 11pt; line-height: 1.45; }
  ${DOC} h2, ${DOC} h3 { break-after: avoid; page-break-after: avoid; }
  ${DOC} h2 { margin-top: 14pt !important; }
  ${DOC} p, ${DOC} li { orphans: 3; widows: 3; }
  ${DOC} [data-keep], ${DOC} table, ${DOC} tr { break-inside: avoid; page-break-inside: avoid; }
  ${DOC} .overflow-x-auto { overflow: visible !important; }
  ${DOC} table { width: 100%; font-size: 9.5pt; }
  ${DOC} th, ${DOC} td { padding: 3px 5px !important; }
  ${DOC} thead { display: table-header-group; }
}
`;

/** Scoped print stylesheet (rendered only while the quy chế page is mounted). */
export function RegulationPrintStyles() {
  return <style>{PRINT_CSS}</style>;
}

/** Print with `document.title` = `title`, so "Lưu PDF" proposes a meaningful file name; restored afterwards. */
export function printWithTitle(title: string): void {
  const previous = document.title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  document.title = title;
  window.print();
}
