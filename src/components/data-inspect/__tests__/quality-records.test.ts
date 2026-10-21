import { describe, expect, it } from "vitest";
import { FIXTURE_HOLIDAY_WEEK, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { ALL_PERIOD } from "@/lib/engine/period";
import { filterIncidents, filterRewards } from "@/lib/engine/filters";
import { dataConfidence } from "@/lib/engine/rag";
import { weeklyTrend } from "@/lib/engine/analytics";
import { toneHex } from "@/components/ui/tones";
import { classConfidence, confidenceBarOption, confidenceTrend, issueCodeCounts, reporterStats, sourceStats, toPct } from "../lib/quality";
import {
  deleteReasonText,
  deletedIncidentRow,
  deletedRewardRow,
  filterRewardRows,
  rewardRows,
  rewardStatusCounts,
  rewardSummary,
  searchDeleted,
  sortDeleted,
} from "../lib/records";

const ds = makeFixtureDataset();
const all = filterIncidents(ds, { period: ALL_PERIOD });

describe("quality view models", () => {
  it("lists class confidence lowest first, using the engine value", () => {
    const rows = classConfidence(all);
    expect(rows[0].label).toBe("7A03");
    expect(rows[0].confidence).toBe(dataConfidence(all.filter((i) => i.classCode === "7A03")));
    for (let k = 1; k < rows.length; k++) expect(rows[k].confidence).toBeGreaterThanOrEqual(rows[k - 1].confidence);
    expect(rows.reduce((n, r) => n + r.incidents, 0)).toBe(all.length);
  });

  it("splits by source and reporter", () => {
    const src = sourceStats(all);
    expect(src.map((s) => s.key)).toEqual(["app", "import"]);
    expect(src[1].review).toBe(3);
    expect(src[0].incidents + src[1].incidents).toBe(all.length);
    const rep = reporterStats(all);
    expect(rep).toHaveLength(1);
    expect(rep[0].incidents).toBe(all.length);
  });

  it("counts issue codes", () => {
    const counts = issueCodeCounts(all);
    expect(counts[0]).toMatchObject({ code: "UNNAMED_STUDENTS", count: 3 });
    expect(counts.find((c) => c.code === "POINTS_MISMATCH_IMPORT")?.count).toBe(2);
  });

  it("turns weeks without incidents into gaps", () => {
    const trend = weeklyTrend(ds, { period: ALL_PERIOD }, FIXTURE_TODAY);
    const t = confidenceTrend(trend);
    const holiday = trend.findIndex((p) => p.week === FIXTURE_HOLIDAY_WEEK);
    expect(t.values[holiday]).toBeNull();
    expect(t.values.filter((v) => v !== null).every((v) => v! >= 0 && v! <= 100)).toBe(true);
    expect(toPct(0.8756)).toBe(87.6);
  });

  it("colours bars below the threshold red", () => {
    const rows = classConfidence(all);
    const option = confidenceBarOption(rows, ds.config.rag.minConfidence) as { series: Array<{ data: Array<{ value: number; itemStyle: { color: string } }> }> };
    const bars = option.series[0].data;
    expect(bars).toHaveLength(rows.length);
    rows.forEach((r, k) => expect(bars[k].itemStyle.color).toBe(r.confidence < ds.config.rag.minConfidence ? toneHex.bad : toneHex.ok));
  });
});

describe("rewards and deleted records", () => {
  const rows = rewardRows(filterRewards(ds, { period: ALL_PERIOD }), ds.config);

  it("flags counted rewards from the config", () => {
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.counted).every((r) => r.reward.status === "Đã xác nhận")).toBe(true);
    expect(rows[0].reward.date >= rows[1].reward.date).toBe(true);
    expect(rewardSummary(rows)).toEqual({ count: 8, points: 51, countedPoints: 30, pending: 4 });
    expect(rewardStatusCounts(rows)["Đang xác minh"]).toBe(2);
    expect(filterRewardRows(rows, { status: "Mới ghi nhận" })).toHaveLength(2);
    expect(filterRewardRows(rows, { query: "6a01" }).every((r) => r.reward.classCode === "6A01")).toBe(true);
  });

  it("normalises deleted rows", () => {
    const inc = { ...all[0], deletedAt: "2026-10-20T03:00:00.000Z", deletedBy: "admin@nshm.test", deleteReason: "RESET:abc123" };
    const rew = { ...ds.rewards[0], deletedAt: "2026-10-21T03:00:00.000Z", deletedBy: "admin@nshm.test", deleteReason: "Nhập nhầm" };
    const sorted = sortDeleted([deletedIncidentRow(inc), deletedRewardRow(rew)]);
    expect(sorted.map((r) => r.kind)).toEqual(["reward", "incident"]);
    expect(deleteReasonText(sorted[1].reason)).toBe("Đặt lại dữ liệu cấp học (lô abc123)");
    expect(deleteReasonText("")).toBe("Không ghi lý do");
    expect(searchDeleted(sorted, "nham")).toHaveLength(1);
  });
});
