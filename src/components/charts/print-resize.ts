/**
 * Print support for canvas charts (framework-free – unit-tested). ECharts draws on a canvas whose pixel width is fixed
 * at screen size; the print layout (A4) is narrower, so a wide chart (e.g. the class × week heatmap) would be cut off
 * at the right margin, losing the latest weeks. Re-render charts at the print width while printing.
 */

/** Widest printed chart (CSS px): A4 portrait with 12 mm margins leaves ≈ 700 px. */
export const PRINT_CHART_WIDTH = 680;

type Size = number | "auto";

/** The part of an ECharts instance used here. */
export interface PrintResizableChart {
  resize(opts?: { width?: Size; height?: Size; animation?: { duration?: number } }): void;
  getDom(): HTMLElement;
  isDisposed(): boolean;
  getZr?(): { refreshImmediately?(fromInside?: boolean): void };
}

interface PrintMediaQuery {
  matches: boolean;
  addEventListener?(type: "change", listener: (e: { matches: boolean }) => void): void;
  removeEventListener?(type: "change", listener: (e: { matches: boolean }) => void): void;
}

/** The part of `window` used here. */
export interface PrintWindow {
  addEventListener(type: "beforeprint" | "afterprint", listener: () => void): void;
  removeEventListener(type: "beforeprint" | "afterprint", listener: () => void): void;
  matchMedia?(query: string): PrintMediaQuery;
}

/**
 * Resize the chart for printing and back. `beforeprint` still sees the screen layout, so the width is capped at
 * PRINT_CHART_WIDTH there; the `print` media-query change (Chrome fires it once the print layout applies) refines it
 * to the real printed column width. `afterprint` restores the automatic (container) size. Returns an unbind function.
 */
export function bindPrintResize(win: PrintWindow, getChart: () => PrintResizableChart | undefined): () => void {
  let fitted = false;
  const live = () => {
    const chart = getChart();
    return chart && !chart.isDisposed() ? chart : undefined;
  };
  const fit = () => {
    const chart = live();
    if (!chart) return;
    const width = Math.min(chart.getDom().clientWidth || PRINT_CHART_WIDTH, PRINT_CHART_WIDTH);
    chart.resize({ width, height: "auto", animation: { duration: 0 } });
    chart.getZr?.().refreshImmediately?.(); // paint now – the print snapshot may not wait for the next frame
    fitted = true;
  };
  const restore = () => {
    if (!fitted) return;
    fitted = false;
    // "auto" (not undefined): an explicit width given before sticks until it is reset.
    live()?.resize({ width: "auto", height: "auto", animation: { duration: 0 } });
  };
  const onMedia = (e: { matches: boolean }) => (e.matches ? fit() : restore());
  const mql = win.matchMedia?.("print");
  win.addEventListener("beforeprint", fit);
  win.addEventListener("afterprint", restore);
  mql?.addEventListener?.("change", onMedia);
  return () => {
    win.removeEventListener("beforeprint", fit);
    win.removeEventListener("afterprint", restore);
    mql?.removeEventListener?.("change", onMedia);
  };
}
