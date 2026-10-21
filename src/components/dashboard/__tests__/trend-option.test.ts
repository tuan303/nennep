import { describe, expect, it } from "vitest";
import { TREND_BAND, buildTrendOption, zoomStart } from "../lib/trend-option";

interface AnySeries {
  type: string;
  name: string;
  yAxisIndex?: number;
  data: Array<{ value: number; itemStyle: { color: string } } | number>;
}

describe("buildTrendOption", () => {
  const categories = ["07/09", "14/09", "21/09", "28/09"];
  const series = [
    { name: "Điểm trừ", data: [4, 8, 10, 12], color: "#dc2626" },
    { name: "Điểm thưởng", data: [0, 10, 5, 0], color: "#eda100" },
  ];

  it("adds a full-height band series on a hidden axis that tints the selected weeks", () => {
    const opt = buildTrendOption({ categories, series, highlight: [false, false, true, true] }) as unknown as {
      series: AnySeries[];
      yAxis: Array<{ show?: boolean; max?: number }>;
      legend: { data?: string[] };
    };
    expect(opt.series[0].name).toBe(TREND_BAND);
    expect(opt.series[0].type).toBe("bar");
    expect(opt.series[0].yAxisIndex).toBe(1);
    expect(opt.yAxis).toHaveLength(2);
    expect(opt.yAxis[1]).toMatchObject({ show: false, max: 1 });
    const colors = (opt.series[0].data as Array<{ itemStyle: { color: string } }>).map((d) => d.itemStyle.color);
    expect(colors[0]).toMatch(/, 0\)$/);
    expect(colors[2]).not.toMatch(/, 0\)$/);
    expect(opt.series.slice(1).map((s) => s.name)).toEqual(["Điểm trừ", "Điểm thưởng"]);
    expect(opt.legend.data).toEqual(["Điểm trừ", "Điểm thưởng"]);
  });

  it("keeps the band out of the tooltip", () => {
    const opt = buildTrendOption({ categories, series, highlight: [false, true, false, false] }) as unknown as {
      tooltip: { formatter: (p: unknown) => string };
    };
    const html = opt.tooltip.formatter([
      { seriesName: TREND_BAND, value: 1, dataIndex: 1, name: "14/09", color: "x" },
      { seriesName: "Điểm trừ", value: 8, dataIndex: 1, name: "14/09", color: "#dc2626" },
    ]);
    expect(html).toContain("Tuần 14/09");
    expect(html).toContain("Điểm trừ");
    expect(html).toContain("kỳ đang xem");
    expect(html.match(/Kỳ đang xem<\/span><b>/)).toBeNull();
  });

  it("has no slider for short series and no band without categories", () => {
    const opt = buildTrendOption({ categories, series, highlight: [] }) as unknown as { dataZoom?: unknown; series: AnySeries[] };
    expect(opt.dataZoom).toBeUndefined();
    const empty = buildTrendOption({ categories: [], series: [{ name: "Sự việc", data: [] }], highlight: [] }) as unknown as { series: AnySeries[] };
    expect(empty.series.map((s) => s.name)).toEqual(["Sự việc"]);
  });

  it("scrolls the slider so the highlighted weeks stay visible", () => {
    expect(zoomStart(40, [])).toBe(20);
    const early = Array.from({ length: 40 }, (_, i) => i === 5);
    expect(zoomStart(40, early)).toBe(3);
    const late = Array.from({ length: 40 }, (_, i) => i === 35);
    expect(zoomStart(40, late)).toBe(20);
    const cats = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const opt = buildTrendOption({ categories: cats, series: [{ name: "Sự việc", data: cats.map(() => 1) }], highlight: early }) as unknown as {
      dataZoom: Array<{ startValue?: number }>;
    };
    expect(opt.dataZoom[0].startValue).toBe(3);
  });
});
