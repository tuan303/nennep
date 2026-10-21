/**
 * Copy plain text to the clipboard (browser only). Resolves false when every method failed – then show the text for
 * manual copying (`copyWithFallback` does both).
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof window !== "undefined" && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied / not focused / in-app WebView (Zalo…) → fall back below.
    }
  }
  if (typeof document === "undefined") return false;
  return execCopy(document, text);
}

/** Open Radix Dialog/Sheet (both render role="dialog"; ConfirmDialog role="alertdialog"). */
const MODAL_SELECTOR = '[role="dialog"],[role="alertdialog"]';

type Focusable = Element & { focus?: (options?: FocusOptions) => void; closest?: (selector: string) => Element | null };

/**
 * Legacy `execCommand("copy")` through a hidden textarea. The textarea goes INSIDE the open modal, if any: Radix traps
 * focus in its content and pulls focus straight back from anything outside – the selection would be lost and nothing
 * (or stale text) copied while execCommand still reports success. Focus returns to the clicked control afterwards.
 */
export function execCopy(doc: Document, text: string): boolean {
  const previous = doc.activeElement as Focusable | null;
  const host = (previous && previous !== doc.body ? previous.closest?.(MODAL_SELECTOR) : null) ?? doc.body;
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.tabIndex = -1;
  const s = area.style;
  s.position = "fixed";
  s.top = "0";
  s.left = "0";
  s.width = "1px";
  s.height = "1px";
  s.padding = "0";
  s.border = "0";
  s.opacity = "0";
  s.pointerEvents = "none";
  s.fontSize = "16px"; // iOS zooms on focusing smaller text
  host.appendChild(area);
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    if (previous && previous !== doc.body) previous.focus?.({ preventScroll: true });
  }
}
