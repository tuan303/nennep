import { beforeAll, describe, expect, it } from "vitest";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { GET as rankingsGET } from "@/app/api/rankings/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import type { ApiErrorBody, RankingsResponse } from "../../contract";
import { addDays, mondayOf, todayVN } from "../../engine/dates";
import { LEVEL_RANKING_GROUP } from "../../engine/ranking";
import { callRoute, createTestUser, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-rankings-thpt";
const today = todayVN();
/** A past day of the calendar; its week has started, so week mode counts exactly 1 week (base 100). */
const day = addDays(today, -7);
const week = mondayOf(day);
let admin = "";

/** L02 = 5 points per occurrence (1 lượt vi phạm each). */
const OCCURRENCES: Record<string, number> = { "10A1": 0, "10A2": 1, "11A1": 0, "11A2": 2, "12A1": 4 };

const rank = (q: string) => callRoute<RankingsResponse & ApiErrorBody>(rankingsGET, { url: `/api/rankings?level=THPT&${q}`, token: admin });

describe("GET /api/rankings – THPT ranks the whole level (fewer lượt vi phạm first on equal scores)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THPT", { classes: [...Object.keys(OCCURRENCES), { code: "12A2", active: false }] });
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    for (const [classCode, occurrenceCount] of Object.entries(OCCURRENCES)) {
      if (occurrenceCount === 0) continue;
      const res = await callRoute(incidentPOST, {
        method: "POST",
        url: "/api/incidents",
        token: admin,
        body: { levelId: "THPT", date: day, classCode, errorCode: "L02", scope: "Tập thể", occurrenceCount },
      });
      expect(res.status).toBe(201);
    }
    // 11A2: 100 − 10 + 5 = 95, the same score as 10A2 (100 − 5) but with 2 lượt vi phạm instead of 1.
    const reward = await callRoute(rewardPOST, {
      method: "POST",
      url: "/api/rewards",
      token: admin,
      body: { levelId: "THPT", date: day, classCode: "11A2", points: 5, reason: "Thưởng phong trào", status: "Đã xác nhận" },
    });
    expect(reward.status).toBe(201);
  });

  it("returns one level-wide table: clean 100s share rank 1, equal 95s are split by lượt vi phạm", async () => {
    const res = await rank(`mode=week&key=${week}`);
    expect(res.status).toBe(200);
    expect(res.body.grades.map((g) => g.grade)).toEqual([LEVEL_RANKING_GROUP]);
    const rows = res.body.grades[0].rows;
    expect(rows.map((r) => [r.classCode, r.grade, r.score, r.violationTurns, r.rank])).toEqual([
      ["10A1", 10, 100, 0, 1],
      ["11A1", 11, 100, 0, 1],
      ["10A2", 10, 95, 1, 3],
      ["11A2", 11, 95, 2, 4],
      ["12A1", 12, 80, 4, 5],
    ]);
    // Inactive 12A2 is out; Top 90% is computed over the whole level (ceil(0.9 × 5) = 5).
    expect(rows.every((r) => r.gradeClassCount === 5 && r.top90Cutoff === 5 && r.inTop90)).toBe(true);
  });

  it("ignores the grade filter and only highlights the filtered class", async () => {
    const res = await rank(`mode=week&key=${week}&grade=11&classCode=11A2`);
    expect(res.status).toBe(200);
    expect(res.body.grades.map((g) => g.grade)).toEqual([LEVEL_RANKING_GROUP]);
    expect(res.body.grades[0].rows).toHaveLength(5);
    expect(res.body.grades[0].rows.filter((r) => r.highlighted).map((r) => [r.classCode, r.rank])).toEqual([["11A2", 4]]);
  });
});
