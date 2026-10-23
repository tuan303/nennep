/** THPT dataset of the report tests (fake classes, no names): one level-wide ranking, fewer lượt vi phạm first. */
import { TODAY, makeClass, makeDataset, makeIncident, makeReward } from "@/lib/engine/__tests__/builders";
import type { LevelDataset, Period, StudentRef } from "@/lib/types";

export const THPT_TODAY = TODAY;
export const THPT_WEEK: Period = { mode: "week", key: "2026-10-19" };
export const THPT_PREVIOUS_WEEK: Period = { mode: "week", key: "2026-10-12" };

const stu = (n: number): StudentRef[] => Array.from({ length: n }, (_, i) => ({ id: `S${i}`, name: `HS ${i}`, classCode: "x" }));

/**
 * Week of 19/10 (6 classes): 10A1, 11A1 = 100 clean (rank 1) · 11A2, 12A1 = 100 with +2 −2, 1 lượt (rank 3) · 12A2 = 96,
 * 1 lượt (rank 5) · 10A2 = 96, 2 lượt (rank 6). Top 3 = 10A1, 11A1, 11A2, 12A1 (tie at the cut).
 * Week of 12/10: only 10A1 loses 2 points (rank 6), every other class ties at rank 1.
 */
export function makeThptDataset(): LevelDataset {
  const g = (code: string) => Number(code.slice(0, 2));
  const penalty = (date: string, classCode: string) => makeIncident({ date, classCode, grade: g(classCode), penalty: 2, students: stu(1) });
  return makeDataset({
    levelId: "THPT",
    classes: ["10A1", "10A2", "11A1", "11A2", "12A1", "12A2"].map((c, i) => makeClass(c, g(c), { levelId: "THPT", order: i })),
    incidents: [
      penalty("2026-10-20", "12A1"),
      penalty("2026-10-20", "11A2"),
      makeIncident({ date: "2026-10-20", classCode: "12A2", grade: 12, penalty: 4, points: 4, unit: "/lần" }),
      makeIncident({ date: "2026-10-21", classCode: "10A2", grade: 10, penalty: 2, students: stu(2) }),
      penalty("2026-10-13", "10A1"),
    ],
    rewards: [
      makeReward({ date: "2026-10-20", classCode: "12A1", grade: 12, points: 2 }),
      makeReward({ date: "2026-10-20", classCode: "11A2", grade: 11, points: 2 }),
    ],
  });
}
