import { describe, expect, it } from "vitest";
import {
  buildBarOption,
  buildDonutOption,
  buildHeatmapOption,
  buildLineOption,
  donutTotal,
  escapeHtml,
  heatmapMax,
  isSeriesEmpty,
} from "./options";
import { CHART_COLORS, CHART_OTHER_COLOR, chartColor } from "./theme";

type AnyRecord = Record<string, unknown>;
const seriesOf = (o: unknown) => (o as { series: AnyRecord[] }).series;

describe("palette", () => {
  it("assigns fixed slots and folds overflow to the neutral 'other' colour", () => {
    expect(chartColor(0)).toBe(CHART_COLORS[0]);
    expect(chartColor(7)).toBe(CHART_COLORS[7]);
    expect(chartColor(8)).toBe(CHART_OTHER_COLOR);
  });
});

describe("isSeriesEmpty", () => {
  it("is empty without categories or when every value is missing", () => {
    expect(isSeriesEmpty([], [{ data: [] }])).toBe(true);
    expect(isSeriesEmpty(["T1"], [{ data: [null] }])).toBe(true);
    expect(isSeriesEmpty(["T1"], [{ data: [0] }])).toBe(false);
  });
});

describe("buildBarOption", () => {
  it("caps bar thickness and rounds only the data end", () => {
    const o = buildBarOption({ categories: ["6A01", "6A02"], series: [{ name: "Điểm trừ", data: [4, 6] }] });
    const s = seriesOf(o)[0] as { barMaxWidth: number; itemStyle: { borderRadius: number[] } };
    expect(s.barMaxWidth).toBe(24);
    expect(s.itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
    expect((o as { legend: { show: boolean } }).legend.show).toBe(false);
  });
  it("horizontal: inverse category axis, rounded right end", () => {
    const full = buildBarOption({ categories: ["a", "b"], series: [{ name: "x", data: [1, 2] }], horizontal: true }) as AnyRecord;
    const o = full.baseOption as AnyRecord;
    expect((o.yAxis as { inverse: boolean; type: string }).type).toBe("category");
    expect((o.yAxis as { inverse: boolean }).inverse).toBe(true);
    expect((seriesOf(o)[0] as { itemStyle: { borderRadius: number[] } }).itemStyle.borderRadius).toEqual([0, 4, 4, 0]);
    expect(Array.isArray(full.media)).toBe(true);
  });
  it("stacked: only the last series of a stack is rounded, segments get a surface gap", () => {
    const o = buildBarOption({
      categories: ["a"],
      series: [
        { name: "x", data: [1], stack: "s" },
        { name: "y", data: [2], stack: "s" },
      ],
    });
    const [a, b] = seriesOf(o) as Array<{ itemStyle: { borderRadius: unknown; borderWidth?: number } }>;
    expect(a.itemStyle.borderRadius).toBe(0);
    expect(b.itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
    expect(a.itemStyle.borderWidth).toBe(1);
    expect((o as { legend: { show: boolean } }).legend.show).toBe(true);
  });
});

describe("buildLineOption", () => {
  it("adds labelled reference lines on the first series and zoom for long ranges", () => {
    const cats = Array.from({ length: 30 }, (_, i) => `T${i + 1}`);
    const o = buildLineOption({
      categories: cats,
      series: [{ name: "Điểm trừ", data: cats.map((_, i) => i) }],
      markLines: [{ value: 10, label: "Ngưỡng vàng" }],
    }) as AnyRecord;
    const s = seriesOf(o)[0] as { markLine: { data: Array<{ yAxis: number }> }; lineStyle: { width: number }; showSymbol: boolean };
    expect(s.markLine.data[0].yAxis).toBe(10);
    expect(s.lineStyle.width).toBe(2);
    expect(s.showSymbol).toBe(false);
    expect(Array.isArray(o.dataZoom)).toBe(true);
  });
});

describe("donut", () => {
  it("totals only positive finite values and escapes tooltip text", () => {
    expect(donutTotal([{ name: "a", value: 3 }, { name: "b", value: -1 }, { name: "c", value: Number.NaN }])).toBe(3);
    const o = buildDonutOption([{ name: "<b>x</b>", value: 1 }]) as { tooltip: { formatter: (p: unknown) => string } };
    const html = o.tooltip.formatter({ name: "<b>x</b>", value: 1, color: "#fff" });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("100%");
  });
});

describe("heatmap", () => {
  it("scales to the max value and scrolls when rows exceed maxRows", () => {
    const values: Array<[number, number, number]> = [
      [0, 0, 2],
      [1, 0, 9],
    ];
    expect(heatmapMax(values)).toBe(9);
    const rows = Array.from({ length: 40 }, (_, i) => `6A${i}`);
    const o = buildHeatmapOption({ xLabels: ["w1", "w2"], yLabels: rows, values, maxRows: 30 }) as AnyRecord;
    expect((o.visualMap as { max: number }).max).toBe(9);
    expect(Array.isArray(o.dataZoom)).toBe(true);
    const tip = (o.tooltip as { formatter: (p: unknown) => string }).formatter({ value: [1, 0, 9] });
    expect(tip).toContain("6A0 · w2");
  });
  it("escapes html", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
