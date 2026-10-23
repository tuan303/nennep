import { describe, expect, it } from "vitest";
import type { RankingRow } from "../../types";
import { groupByScoreBand, SCORE_BAND_RULES, scoreBandLabel, scoreBandOf, scoreShare } from "../score-bands";

const rule = SCORE_BAND_RULES.THCS!;
const row = (classCode: string, score: number, rank: number, base = 100) => ({ classCode, score, rank, base }) as RankingRow;

describe("score bands (Báo cáo tuần/tháng THCS)", () => {
  it("only THCS uses them; labels follow the rule", () => {
    expect(Object.keys(SCORE_BAND_RULES)).toEqual(["THCS"]);
    expect(["LEADER", "HIGH", "MIDDLE", "LOW"].map((b) => scoreBandLabel(b as never, rule))).toEqual(["Dẫn đầu", "Top >90%", "Top 51%–90%", "Top <51%"]);
  });

  it("week (điểm nền 100): leaders are every class tied at the top, then 91+ / 51–90 / below 51", () => {
    const rows = [row("6A01", 103, 1), row("6A02", 103, 1), row("6A03", 100, 3), row("6A04", 91, 4), row("6A05", 90, 5), row("6A06", 51, 6), row("6A07", 50, 7), row("6A08", -4, 8)];
    const g = groupByScoreBand(rows, rule);
    expect(g.LEADER.map((r) => r.classCode)).toEqual(["6A01", "6A02"]);
    expect(g.HIGH.map((r) => r.classCode)).toEqual(["6A03", "6A04"]);
    expect(g.MIDDLE.map((r) => r.classCode)).toEqual(["6A05", "6A06"]);
    expect(g.LOW.map((r) => r.classCode)).toEqual(["6A07", "6A08"]);
  });

  it("a leader is 'Dẫn đầu' whatever its score", () => {
    expect(scoreBandOf(row("6A01", 42, 1), rule)).toBe("LEADER");
    expect(scoreBandOf(row("6A02", 41, 2), rule)).toBe("LOW");
  });

  it("month: the share is against 100 × counted weeks", () => {
    expect(scoreBandOf(row("6A02", 362, 2, 400), rule)).toBe("HIGH"); // 90.5%
    expect(scoreBandOf(row("6A03", 360, 3, 400), rule)).toBe("MIDDLE"); // 90%
    expect(scoreBandOf(row("6A04", 204, 4, 400), rule)).toBe("MIDDLE"); // 51%
    expect(scoreBandOf(row("6A05", 203.5, 5, 400), rule)).toBe("LOW"); // 50.875%
    expect(scoreShare(row("6A05", 203.5, 5, 400))).toBe(50.88);
  });

  it("no float noise at the boundary with a non-default base (5.1 of 10 = 51%)", () => {
    expect(scoreBandOf(row("6A02", 5.1, 2, 10), rule)).toBe("MIDDLE");
    expect(scoreBandOf(row("6A03", 9.01, 3, 10), rule)).toBe("HIGH");
    expect(scoreBandOf(row("6A04", 9, 4, 10), rule)).toBe("MIDDLE");
  });

  it("no counted week → no band", () => {
    expect(scoreBandOf(row("6A01", 0, 1, 0), rule)).toBeUndefined();
    expect(scoreShare(row("6A01", 0, 1, 0))).toBeUndefined();
    expect(groupByScoreBand([row("6A01", 0, 1, 0)], rule).LEADER).toEqual([]);
  });
});
