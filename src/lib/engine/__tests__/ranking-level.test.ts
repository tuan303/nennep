import { describe, expect, it } from "vitest";
import type { StudentRef } from "../../types";
import { rankHistory } from "../analytics-history";
import { buildRanking, classScoreSeries, competitionRanks, findRankingGroup, LEVEL_RANKING_GROUP, rankingGroupLabel, rankingRuleOf, topRows } from "../ranking";
import { TODAY, makeClass, makeDataset, makeIncident, makeReward } from "./builders";

const WEEK = { mode: "week" as const, key: "2026-10-19" };
const stu = (n: number): StudentRef[] => Array.from({ length: n }, (_, i) => ({ id: `S${i}`, name: `HS ${i}`, classCode: "x" }));

/** THPT week of 19/10: 10A1, 11A1 = 100 (clean) · 12A1 = 100 (+2 −2, 1 lượt) · 12A2 = 96 (1 lượt) · 10A2 = 96 (2 lượt). */
function thpt() {
  return makeDataset({
    levelId: "THPT",
    classes: [makeClass("10A1", 10), makeClass("10A2", 10), makeClass("11A1", 11), makeClass("12A1", 12), makeClass("12A2", 12)],
    incidents: [
      makeIncident({ date: "2026-10-20", classCode: "12A1", grade: 12, penalty: 2, students: stu(1) }),
      makeIncident({ date: "2026-10-20", classCode: "12A2", grade: 12, penalty: 4, points: 4, unit: "/lần" }),
      makeIncident({ date: "2026-10-21", classCode: "10A2", grade: 10, penalty: 2, students: stu(2) }),
    ],
    rewards: [makeReward({ date: "2026-10-20", classCode: "12A1", grade: 12, points: 2, status: "Đã xác nhận" })],
  });
}

describe("THPT ranking (whole level, fewer lượt vi phạm first)", () => {
  it("rule of the levels", () => {
    expect(rankingRuleOf("THPT")).toEqual({ scope: "level", tieBreak: "violationTurns", topCount: 3 });
    expect(rankingRuleOf("THCS")).toEqual({ scope: "grade", tieBreak: "none" });
    expect(rankingRuleOf("TH")).toEqual({ scope: "grade", tieBreak: "none" });
    expect(rankingGroupLabel(LEVEL_RANKING_GROUP)).toBe("Toàn cấp");
    expect(rankingGroupLabel(10)).toBe("Khối 10");
  });

  it("competitionRanks: equal scores ordered by the tie key, still equal → same rank (1,1,3,4,5)", () => {
    expect(competitionRanks([100, 100, 100, 96, 96], [0, 0, 1, 1, 2])).toEqual([1, 1, 3, 4, 5]);
    expect(competitionRanks([100, 100, 100, 96, 96])).toEqual([1, 1, 1, 4, 4]);
  });

  it("one table for the level; clean 100s tie; equal scores ranked by lượt vi phạm", () => {
    const r = buildRanking(thpt(), WEEK, TODAY);
    expect(r.grades).toHaveLength(1);
    const g = r.grades[0];
    expect(g.grade).toBe(LEVEL_RANKING_GROUP);
    expect(g.rows.map((x) => [x.classCode, x.score, x.violationTurns, x.rank])).toEqual([
      ["10A1", 100, 0, 1],
      ["11A1", 100, 0, 1],
      ["12A1", 100, 1, 3],
      ["12A2", 96, 1, 4],
      ["10A2", 96, 2, 5],
    ]);
    expect(g.rows.find((x) => x.classCode === "12A2")?.grade).toBe(12); // rows keep their real grade
    expect(g.rows.every((x) => x.gradeClassCount === 5 && x.top90Cutoff === 5)).toBe(true);
    // opts.grade does not split a level-wide ranking.
    expect(buildRanking(thpt(), WEEK, TODAY, { grade: 12 }).grades[0].rows).toHaveLength(5);
    expect(findRankingGroup(r, "12A2")).toBe(g);
  });

  it("topRows: the first N classes with every class tied at the cut", () => {
    const rows = buildRanking(thpt(), WEEK, TODAY).grades[0].rows;
    expect(topRows(rows, 3).map((x) => x.classCode)).toEqual(["10A1", "11A1", "12A1"]);
    expect(topRows(rows, 1).map((x) => x.classCode)).toEqual(["10A1", "11A1"]);
    expect(topRows(rows, 0)).toEqual([]);
  });

  it("weekly series and rank history use the same population and tie-break", () => {
    const ds = thpt();
    expect(classScoreSeries(ds, "12A2", TODAY).find((p) => p.week === "2026-10-19")).toMatchObject({ score: 96, rank: 4 });
    expect(classScoreSeries(ds, "10A2", TODAY).find((p) => p.week === "2026-10-19")).toMatchObject({ score: 96, rank: 5 });
    const h = rankHistory(ds, 12, TODAY, { basis: "week", period: WEEK });
    expect(h.grade).toBe(LEVEL_RANKING_GROUP);
    expect(h.classes).toHaveLength(5);
    const last = Object.fromEntries(h.classes.map((c) => [c.classCode, c.ranks.at(-1)]));
    expect(last).toEqual({ "10A1": 1, "11A1": 1, "12A1": 3, "12A2": 4, "10A2": 5 });
  });

  it("THCS keeps one table per grade without tie-break", () => {
    const ds = { ...thpt(), levelId: "THCS" as const };
    const r = buildRanking(ds, WEEK, TODAY);
    expect(r.grades.map((g) => g.grade)).toEqual([10, 11, 12]);
    expect(r.grades[2].rows.map((x) => [x.classCode, x.rank])).toEqual([["12A1", 1], ["12A2", 2]]);
  });
});

describe("namedTop (shared by every screen)", () => {
  it("Top 3 with ties; small table still listed; all tied → allTied; no counted week → nothing", async () => {
    const { namedTop } = await import("../ranking");
    const rows = buildRanking(thpt(), WEEK, TODAY).grades[0].rows;
    expect(namedTop(rows, 3)).toEqual({ rows: rows.slice(0, 3), allTied: false });
    expect(namedTop(rows.slice(2, 4), 3).rows.map((r) => r.classCode)).toEqual(["12A1", "12A2"]);
    const clean = buildRanking({ ...thpt(), incidents: [], rewards: [] }, WEEK, TODAY).grades[0].rows;
    expect(namedTop(clean, 3)).toEqual({ rows: [], allTied: true });
    expect(namedTop(rows, undefined)).toEqual({ rows: [], allTied: false });
    expect(namedTop(rows.map((r) => ({ ...r, countedWeeks: 0 })), 3)).toEqual({ rows: [], allTied: false });
  });
});
