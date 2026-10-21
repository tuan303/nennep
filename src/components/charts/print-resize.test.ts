import { describe, expect, it, vi } from "vitest";
import { PRINT_CHART_WIDTH, bindPrintResize, type PrintResizableChart, type PrintWindow } from "./print-resize";

function fakeWindow() {
  const handlers = new Map<string, Set<() => void>>();
  const mediaHandlers = new Set<(e: { matches: boolean }) => void>();
  const win: PrintWindow = {
    addEventListener: (t, fn) => void (handlers.get(t) ?? handlers.set(t, new Set()).get(t)!).add(fn),
    removeEventListener: (t, fn) => void handlers.get(t)?.delete(fn),
    matchMedia: () => ({
      matches: false,
      addEventListener: (_t, fn) => void mediaHandlers.add(fn),
      removeEventListener: (_t, fn) => void mediaHandlers.delete(fn),
    }),
  };
  return {
    win,
    fire: (t: "beforeprint" | "afterprint") => handlers.get(t)?.forEach((fn) => fn()),
    media: (matches: boolean) => mediaHandlers.forEach((fn) => fn({ matches })),
    count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0) + mediaHandlers.size,
  };
}

function fakeChart(width: number) {
  const dom = { clientWidth: width };
  const refresh = vi.fn();
  const chart = {
    resize: vi.fn(),
    getDom: () => dom as unknown as HTMLElement,
    isDisposed: () => false,
    getZr: () => ({ refreshImmediately: refresh }),
  } satisfies PrintResizableChart;
  return { chart, dom, refresh };
}

describe("bindPrintResize (charts clipped when printing)", () => {
  it("re-renders a wide screen chart at the print width, then back to automatic size", () => {
    const w = fakeWindow();
    const { chart, dom, refresh } = fakeChart(1400); // full-width heatmap on a large monitor
    const unbind = bindPrintResize(w.win, () => chart);

    w.fire("beforeprint"); // still the screen layout → capped
    expect(chart.resize).toHaveBeenLastCalledWith({ width: PRINT_CHART_WIDTH, height: "auto", animation: { duration: 0 } });
    expect(refresh).toHaveBeenCalled();

    dom.clientWidth = 330; // print layout applied (e.g. two charts side by side)
    w.media(true);
    expect(chart.resize).toHaveBeenLastCalledWith({ width: 330, height: "auto", animation: { duration: 0 } });

    dom.clientWidth = 1400;
    w.fire("afterprint");
    expect(chart.resize).toHaveBeenLastCalledWith({ width: "auto", height: "auto", animation: { duration: 0 } });
    w.media(false); // already restored → no extra resize
    expect(chart.resize).toHaveBeenCalledTimes(3);

    unbind();
    expect(w.count()).toBe(0);
  });

  it("ignores missing or disposed charts", () => {
    const w = fakeWindow();
    bindPrintResize(w.win, () => undefined);
    expect(() => w.fire("beforeprint")).not.toThrow();
    const { chart } = fakeChart(900);
    bindPrintResize(w.win, () => ({ ...chart, isDisposed: () => true }));
    w.fire("beforeprint");
    w.fire("afterprint");
    expect(chart.resize).not.toHaveBeenCalled();
  });
});
