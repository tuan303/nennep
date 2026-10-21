import { describe, expect, it } from "vitest";
import { BUMP_FADED_COLOR, BUMP_HIGHLIGHT_COLOR, buildBumpOption, bumpColors, bumpPointText, bumpTotal, type BumpLine } from "./bump-option";
import { buildBarOption } from "./options";
import { CHART_COLORS } from "./theme";

type AnyRecord = Record<string, unknown>;

const LINES: BumpLine[] = [
  { name: "6A01", ranks: [1, 2, 1], scores: [100, 190, 300], emphasis: "top" },
  { name: "6A02", ranks: [2, 1, 3], scores: [95, 200, 280], emphasis: "highlight" },
  { name: "6A03", ranks: [3, 3, 2], scores: [90, 185, 290], emphasis: "faded" },
  { name: "6A04", ranks: [4, 4, null], emphasis: "top" },
];

describe("bump option helpers", () => {
  it("takes the largest rank as N and colours lines by emphasis", () => {
    expect(bumpTotal(LINES)).toBe(4);
    expect(bumpTotal([])).toBe(1);
    expect(bumpColors(LINES)).toEqual([CHART_COLORS[0], BUMP_HIGHLIGHT_COLOR, BUMP_FADED_COLOR, CHART_COLORS[1]]);
    expect(bumpColors([{ emphasis: "top", color: "#123456" }])).toEqual(["#123456"]);
  });

  it("writes the tooltip line 'Tuần dd/mm: hạng X/N · điểm Y'", () => {
    expect(bumpPointText({ header: "Tuần 12/10", rank: 2, total: 8, score: 385.5 })).toBe("Tuần 12/10: hạng 2/8 · điểm 385,5");
    expect(bumpPointText({ header: "Tuần 12/10", rank: null, total: 8 })).toBe("Tuần 12/10: chưa xếp hạng");
  });
});

describe("buildBumpOption", () => {
  const o = buildBumpOption({ categories: ["05/10", "12/10", "19/10"], lines: LINES }) as AnyRecord;
  const series = o.series as Array<AnyRecord & { name: string; data: unknown[]; lineStyle: { width: number; color: string }; endLabel: { show: boolean } }>;

  it("inverts the y axis from 1 to N with integer ticks", () => {
    expect(o.yAxis).toMatchObject({ type: "value", inverse: true, min: 1, max: 4, interval: 1 });
    const fmt = (o.yAxis as { axisLabel: { formatter: (v: number) => string } }).axisLabel.formatter;
    expect(fmt(3)).toBe("#3");
    expect(fmt(2.5)).toBe("");
  });

  it("draws faded lines first, without end labels; emphasised lines on top", () => {
    expect(series.map((s) => s.name)).toEqual(["6A03", "6A01", "6A02", "6A04"]);
    const faded = series[0];
    expect(faded.lineStyle.color).toBe(BUMP_FADED_COLOR);
    expect(faded.endLabel.show).toBe(false);
    const highlight = series.find((s) => s.name === "6A02")!;
    expect(highlight.lineStyle).toMatchObject({ color: BUMP_HIGHLIGHT_COLOR, width: 3.5 });
    expect(highlight.endLabel.show).toBe(true);
    expect(series.find((s) => s.name === "6A04")!.data).toEqual([4, 4, null]);
  });

  it("hides the faded lines through the legend selection when asked", () => {
    expect((o.legend as { selected: Record<string, boolean> }).selected).toEqual({ "6A01": true, "6A02": true, "6A03": true, "6A04": true });
    const hidden = buildBumpOption({ categories: ["05/10"], lines: LINES, showFaded: false }) as AnyRecord;
    expect((hidden.legend as { selected: Record<string, boolean> }).selected["6A03"]).toBe(false);
    expect((hidden.legend as { selected: Record<string, boolean> }).selected["6A01"]).toBe(true);
  });

  it("formats the item tooltip with rank, N and score", () => {
    const fmt = (o.tooltip as { formatter: (p: unknown) => string }).formatter;
    const html = fmt({ seriesName: "6A01", dataIndex: 1, color: "#000" });
    expect(html).toContain("Lớp 6A01");
    expect(html).toContain("Tuần 12/10: hạng 2/4 · điểm 190");
    const custom = buildBumpOption({ categories: ["a"], lines: LINES, total: 8, headerOf: () => "Tuần 01/09" }) as AnyRecord;
    expect((custom.tooltip as { formatter: (p: unknown) => string }).formatter({ seriesName: "6A02", dataIndex: 0 })).toContain("Tuần 01/09: hạng 2/8");
  });

  it("adds a slider for long school years", () => {
    const cats = Array.from({ length: 30 }, (_, i) => `w${i}`);
    expect((buildBumpOption({ categories: cats, lines: LINES }) as AnyRecord).dataZoom).toBeDefined();
    expect(o.dataZoom).toBeUndefined();
  });
});

describe("buildBarOption per-bar colours", () => {
  it("maps data points to coloured items, keeping the series colour elsewhere", () => {
    const opt = buildBarOption({ categories: ["a", "b"], series: [{ name: "x", data: [3, 5], color: "#111111", colors: ["#ff0000", undefined] }], showValues: true });
    const s = (opt as { series: Array<{ data: unknown[]; itemStyle: { color: string } }> }).series[0];
    expect(s.data).toEqual([{ value: 3, itemStyle: { color: "#ff0000" } }, 5]);
    expect(s.itemStyle.color).toBe("#111111");
  });
});
