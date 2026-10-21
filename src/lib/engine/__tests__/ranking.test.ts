import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import { RAG_REASON_NOT_APPROVED, dataConfidence, ragFor } from "../rag";
import { buildRanking, classScoreSeries, competitionRanks, findRankingRow, top90Cutoff } from "../ranking";
import { TODAY, makeClass, makeConfig, makeDataset, makeIncident, makeReward } from "./builders";

const WEEK = { mode: "week" as const, key: "2026-10-19" };
const OCT = { mode: "month" as const, key: "2026-10" };

describe("AC-007 competition score", () => {
  it("base 100 + reward 10 − penalty 25 = 85 (uncounted reward statuses ignored)", () => {
    const ds = makeDataset({
      classes: [makeClass("6A01", 6)],
      incidents: [makeIncident({ date: "2026-10-19", classCode: "6A01", points: 10 }), makeIncident({ date: "2026-10-20", classCode: "6A01", points: 15 })],
      rewards: [
        makeReward({ date: "2026-10-20", classCode: "6A01", points: 10, status: "Đã xác nhận" }),
        makeReward({ date: "2026-10-20", classCode: "6A01", points: 7, status: "Mới ghi nhận" }),
        makeReward({ date: "2026-10-20", classCode: "6A01", points: 3, status: "Đang xác minh" }),
      ],
    });
    const row = buildRanking(ds, WEEK, TODAY).grades[0].rows[0];
    expect(row).toMatchObject({ countedWeeks: 1, base: 100, rewardPoints: 10, penaltyPoints: 25, score: 85, incidentCount: 2 });
  });

  it("score may be negative (no floor) and counted statuses are configurable", () => {
    const ds = makeDataset({
      config: makeConfig({ rewardCountedStatuses: ["Đã xác nhận", "Đang xác minh"] }),
      classes: [makeClass("6A01", 6)],
      incidents: [makeIncident({ date: "2026-10-19", classCode: "6A01", points: 130 })],
      rewards: [makeReward({ date: "2026-10-20", classCode: "6A01", points: 3, status: "Đang xác minh" })],
    });
    expect(buildRanking(ds, WEEK, TODAY).grades[0].rows[0].score).toBe(-27);
  });
});

describe("AC-008 competition ranks", () => {
  it("100, 90, 90, 80 → 1, 2, 2, 4", () => {
    expect(competitionRanks([100, 90, 90, 80])).toEqual([1, 2, 2, 4]);
  });
  it("handles several tie groups, input order and round2", () => {
    expect(competitionRanks([50, 70, 70, 90, 50, 30])).toEqual([4, 2, 2, 1, 4, 6]);
    expect(competitionRanks([80, 80, 80])).toEqual([1, 1, 1]);
    expect(competitionRanks([90.004, 90.001, 89.99])).toEqual([1, 1, 3]);
    expect(competitionRanks([])).toEqual([]);
  });
});

describe("AC-009 / AC-010 Top 90%", () => {
  it("10 classes → cutoff 9; floating point safe", () => {
    expect(top90Cutoff(10, 0.9)).toBe(9);
    expect(top90Cutoff(70, 0.9)).toBe(63);
    expect(top90Cutoff(21, 0.9)).toBe(19);
    expect(top90Cutoff(5, 0.9)).toBe(5);
    expect(top90Cutoff(0, 0.9)).toBe(0);
  });

  /** 10 classes 6A1…6A10 of grade 6; class i gets penalties[i] points in the current week. */
  const tenClasses = (penalties: number[]) =>
    makeDataset({
      classes: penalties.map((_, i) => makeClass(`6A${i + 1}`, 6, { order: i })),
      incidents: penalties.map((p, i) => makeIncident({ date: "2026-10-19", classCode: `6A${i + 1}`, points: p })),
    });

  it("positions 9 and 10 tied → both inside Top 90%", () => {
    const ds = tenClasses([0, 1, 2, 3, 4, 5, 6, 7, 9, 9]);
    const rows = buildRanking(ds, WEEK, TODAY).grades[0].rows;
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.top90Cutoff === 9 && r.gradeClassCount === 10)).toBe(true);
    const r9 = rows.find((r) => r.classCode === "6A9");
    const r10 = rows.find((r) => r.classCode === "6A10");
    expect(r9?.rank).toBe(9);
    expect(r10?.rank).toBe(9);
    expect(r9?.inTop90).toBe(true);
    expect(r10?.inTop90).toBe(true);
    expect(rows.every((r) => r.inTop90)).toBe(true);
  });

  it("a single last class at position 10 is outside Top 90%", () => {
    const ds = tenClasses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const rows = buildRanking(ds, WEEK, TODAY).grades[0].rows;
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.filter((r) => !r.inTop90).map((r) => r.classCode)).toEqual(["6A10"]);
  });

  it("rows are sorted by rank then natural class code (6A2 before 6A10)", () => {
    const ds = makeDataset({ classes: ["6A10", "6A2", "6A1"].map((c) => makeClass(c, 6)) });
    expect(buildRanking(ds, WEEK, TODAY).grades[0].rows.map((r) => r.classCode)).toEqual(["6A1", "6A2", "6A10"]);
  });
});

describe("AC-011 class filter never changes the ranking population", () => {
  it("highlightClass only highlights; grade option only limits the returned tables", () => {
    const ds = makeFixtureDataset();
    const plain = buildRanking(ds, OCT, FIXTURE_TODAY);
    const highlighted = buildRanking(ds, OCT, FIXTURE_TODAY, { highlightClass: "6A04" });
    const strip = (r: typeof plain) => r.grades.map((g) => g.rows.map(({ highlighted: _h, ...rest }) => rest));
    expect(strip(highlighted)).toEqual(strip(plain));
    const flagged = highlighted.grades.flatMap((g) => g.rows).filter((r) => r.highlighted);
    expect(flagged.map((r) => r.classCode)).toEqual(["6A04"]);
    expect(findRankingRow(highlighted, "6A04")?.rank).toBe(findRankingRow(plain, "6A04")?.rank);
    expect(findRankingRow(highlighted, "6A04")?.rank).toBe(4);

    const grade6 = buildRanking(ds, OCT, FIXTURE_TODAY, { grade: 6, highlightClass: "6A04" });
    expect(grade6.grades.map((g) => g.grade)).toEqual([6]);
    expect(grade6.grades[0].rows.map((r) => [r.classCode, r.rank])).toEqual(plain.grades[0].rows.map((r) => [r.classCode, r.rank]));
    expect(grade6.grades[0].rows.every((r) => r.gradeClassCount === 5)).toBe(true);
  });

  it("inactive classes are not ranked", () => {
    const ds = makeFixtureDataset();
    const g7 = buildRanking(ds, OCT, FIXTURE_TODAY).grades.find((g) => g.grade === 7);
    expect(g7?.rows.map((r) => r.classCode).sort()).toEqual(["7A01", "7A02", "7A03"]);
    expect(findRankingRow(buildRanking(ds, OCT, FIXTURE_TODAY), "7A04")).toBeUndefined();
  });

  it("fixture October ranking matches the story", () => {
    const ds = makeFixtureDataset();
    const r = buildRanking(ds, OCT, FIXTURE_TODAY);
    expect(r.countedWeeks).toBe(3);
    const a03 = findRankingRow(r, "6A03");
    expect(a03).toMatchObject({ base: 300, penaltyPoints: 77, score: 223, rank: 5, rag: "RED", avgWeeklyPenalty: 25.67 });
    expect(a03?.ragReason).toBe("Trung bình 25,67 điểm trừ/tuần ≥ ngưỡng Đỏ 25");
    expect(findRankingRow(r, "7A02")).toMatchObject({ rag: "YELLOW", avgWeeklyPenalty: 11.33 });
    // 6A01 (300 + 5 − 11) and 6A05 (300 − 6) tie for first
    expect(findRankingRow(r, "6A01")).toMatchObject({ score: 294, rank: 1 });
    expect(findRankingRow(r, "6A05")).toMatchObject({ score: 294, rank: 1 });
    expect(findRankingRow(r, "6A02")?.rank).toBe(3);
  });
});

describe("AC-012 RAG gray when data is unreliable", () => {
  it("a class whose incidents lack student links is GRAY with a reason", () => {
    const ds = makeFixtureDataset();
    const row = findRankingRow(buildRanking(ds, OCT, FIXTURE_TODAY), "7A03");
    expect(row?.confidence).toBe(0.5);
    expect(row?.rag).toBe("GRAY");
    expect(row?.ragReason).toBe("Độ tin cậy dữ liệu thấp (50%)");
  });

  it("synthetic: REVIEW incident (missing students) → GRAY instead of RED", () => {
    const ds = makeDataset({
      classes: [makeClass("6A01", 6)],
      incidents: [
        makeIncident({ date: "2026-10-19", classCode: "6A01", points: 30 }),
        makeIncident({ date: "2026-10-20", classCode: "6A01", points: 0, dataCheck: "REVIEW" }),
      ],
    });
    const row = buildRanking(ds, WEEK, TODAY).grades[0].rows[0];
    expect(row.rag).toBe("GRAY");
    expect(row.ragReason).toContain("Độ tin cậy dữ liệu thấp");
  });

  it("unapproved thresholds → every class GRAY", () => {
    const ds = makeFixtureDataset();
    ds.config.rag.approved = false;
    const rows = buildRanking(ds, OCT, FIXTURE_TODAY).grades.flatMap((g) => g.rows);
    expect(rows.every((r) => r.rag === "GRAY" && r.ragReason === RAG_REASON_NOT_APPROVED)).toBe(true);
    expect(RAG_REASON_NOT_APPROVED).toBe("Ngưỡng cảnh báo chưa được phê duyệt");
  });
});

describe("ragFor / dataConfidence", () => {
  const config = makeConfig();
  it("thresholds are inclusive and reasons include the numbers", () => {
    expect(ragFor({ avgWeeklyPenalty: 25, confidence: 1, config })).toEqual({ rag: "RED", reason: "Trung bình 25 điểm trừ/tuần ≥ ngưỡng Đỏ 25" });
    expect(ragFor({ avgWeeklyPenalty: 12, confidence: 1, config })).toEqual({ rag: "YELLOW", reason: "Trung bình 12 điểm trừ/tuần ≥ ngưỡng Vàng 10" });
    expect(ragFor({ avgWeeklyPenalty: 10, confidence: 1, config }).rag).toBe("YELLOW");
    expect(ragFor({ avgWeeklyPenalty: 9.5, confidence: 1, config })).toEqual({ rag: "GREEN", reason: "Trung bình 9,5 điểm trừ/tuần < ngưỡng Vàng 10" });
    expect(ragFor({ avgWeeklyPenalty: 40, confidence: 0.79, config })).toEqual({ rag: "GRAY", reason: "Độ tin cậy dữ liệu thấp (79%)" });
    expect(ragFor({ avgWeeklyPenalty: 40, confidence: 0.8, config }).rag).toBe("RED");
    expect(ragFor({ avgWeeklyPenalty: 0, confidence: 1, config: makeConfig({ rag: { ...config.rag, approved: false } }) }).rag).toBe("GRAY");
  });

  it("dataConfidence = (OK + THIEU_TEN_HS) / total, 1 when empty", () => {
    expect(dataConfidence([])).toBe(1);
    const mk = (dataCheck: "OK" | "THIEU_TEN_HS" | "REVIEW") => makeIncident({ date: "2026-10-19", classCode: "6A01", dataCheck });
    expect(dataConfidence([mk("OK"), mk("THIEU_TEN_HS"), mk("REVIEW"), mk("REVIEW")])).toBe(0.5);
  });
});

describe("classScoreSeries", () => {
  it("one point per elapsed counted week with the weekly rank inside the grade", () => {
    const ds = makeFixtureDataset();
    const series = classScoreSeries(ds, "6A03", FIXTURE_TODAY);
    expect(series).toHaveLength(9); // 2026-08-17 … 2026-10-19 minus the holiday week
    expect(series.some((p) => p.week === "2026-08-31")).toBe(false);
    expect(series.find((p) => p.week === "2026-10-12")).toEqual({ week: "2026-10-12", score: 68, penalty: 32, reward: 0, rank: 5 });
    const a01 = classScoreSeries(ds, "6A01", FIXTURE_TODAY).find((p) => p.week === "2026-09-14");
    expect(a01).toMatchObject({ reward: 10, penalty: 4, score: 106, rank: 1 });
    expect(classScoreSeries(ds, "9Z99", FIXTURE_TODAY)).toEqual([]);
  });
});
