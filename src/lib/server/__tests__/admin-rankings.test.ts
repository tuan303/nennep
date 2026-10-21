import { beforeAll, describe, expect, it } from "vitest";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { GET as rankingsGET } from "@/app/api/rankings/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import type { ApiErrorBody, RankingsResponse } from "../../contract";
import { addDays, mondayOf, todayVN } from "../../engine/dates";
import type { RankingRow } from "../../types";
import { callRoute, createTestUser, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-rankings";
const today = todayVN();
/** A past day of the calendar; its week has started, so week mode counts exactly 1 week (base 100). */
const day = addDays(today, -7);
const week = mondayOf(day);
const t = { admin: "", viewer: "", gvcn: "", other: "" };

/** Penalty points per class (L02 = 5 points per occurrence). */
const PENALTY: Record<string, number> = {
  "6A01": 25, "6A02": 10, "6A03": 10, "6A04": 20, "6A05": 0, "6A06": 30, "6A07": 40, "6A08": 50, "6A09": 60, "6A10": 60,
  "7A01": 0, "7A02": 10, "7A03": 10, "7A04": 20,
};

const rank = (q: string, token = t.admin) => callRoute<RankingsResponse & ApiErrorBody>(rankingsGET, { url: `/api/rankings?level=THCS&${q}`, token });
const rowsOf = (r: RankingsResponse, grade: number): RankingRow[] => r.grades.find((g) => g.grade === grade)?.rows ?? [];
const row = (r: RankingsResponse, code: string) => r.grades.flatMap((g) => g.rows).find((x) => x.classCode === code);

describe("GET /api/rankings (AC-007..AC-011)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: [...Object.keys(PENALTY), { code: "7A05", active: false }] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER", levels: ["THCS"] })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
    t.other = (await createTestUser({ uid: "other", role: "VIEWER", levels: ["TH"] })).token;
    for (const [classCode, points] of Object.entries(PENALTY)) {
      if (points === 0) continue;
      const res = await callRoute(incidentPOST, {
        method: "POST",
        url: "/api/incidents",
        token: t.admin,
        body: { levelId: "THCS", date: day, classCode, errorCode: "L02", scope: "Tập thể", occurrenceCount: points / 5 },
      });
      expect(res.status).toBe(201);
    }
    const reward = (classCode: string, points: number, status: string) =>
      callRoute(rewardPOST, { method: "POST", url: "/api/rewards", token: t.admin, body: { levelId: "THCS", date: day, classCode, points, reason: "Thưởng phong trào", status } });
    expect((await reward("6A01", 10, "Đã xác nhận")).status).toBe(201);
    expect((await reward("6A10", 50, "Mới ghi nhận")).status).toBe(201); // not counted
  });

  it("AC-007: score = base + counted rewards − penalties (100 + 10 − 25 = 85)", async () => {
    const res = await rank(`mode=week&key=${week}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ levelId: "THCS", period: { mode: "week", key: week }, countedWeeks: 1 });
    expect(row(res.body, "6A01")).toMatchObject({ base: 100, rewardPoints: 10, penaltyPoints: 25, score: 85 });
    expect(row(res.body, "6A10")).toMatchObject({ rewardPoints: 0, score: 40 });
  });

  it("AC-008: competition ranks 100, 90, 90, 80 → 1, 2, 2, 4", async () => {
    const res = await rank(`mode=week&key=${week}`);
    const g7 = rowsOf(res.body, 7);
    expect(g7.map((r) => [r.classCode, r.score, r.rank])).toEqual([
      ["7A01", 100, 1],
      ["7A02", 90, 2],
      ["7A03", 90, 2],
      ["7A04", 80, 4],
    ]);
  });

  it("AC-009 / AC-010: 10 classes → cutoff 9; ties at the cutoff are inside Top 90%", async () => {
    const res = await rank(`mode=week&key=${week}`);
    const g6 = rowsOf(res.body, 6);
    expect(g6).toHaveLength(10);
    expect(g6.every((r) => r.gradeClassCount === 10 && r.top90Cutoff === 9)).toBe(true);
    expect(row(res.body, "6A09")).toMatchObject({ score: 40, rank: 9, inTop90: true });
    expect(row(res.body, "6A10")).toMatchObject({ score: 40, rank: 9, inTop90: true });
    expect(row(res.body, "6A08")).toMatchObject({ rank: 8, inTop90: true });
  });

  it("AC-011: the class filter only highlights; the rank stays 4 within the grade population", async () => {
    const res = await rank(`mode=week&key=${week}&classCode=6A01`);
    expect(row(res.body, "6A01")).toMatchObject({ rank: 4, highlighted: true });
    expect(rowsOf(res.body, 6)).toHaveLength(10);
    expect(res.body.grades.flatMap((g) => g.rows).filter((r) => r.highlighted)).toHaveLength(1);
    const g6only = await rank(`mode=week&key=${week}&grade=6`);
    expect(g6only.body.grades.map((g) => g.grade)).toEqual([6]);
    expect(row(g6only.body, "6A01")?.rank).toBe(4);
  });

  it("defaults to the current week, validates keys and enforces level access", async () => {
    const def = await rank("");
    expect(def.status).toBe(200);
    expect(def.body.period).toEqual({ mode: "week", key: mondayOf(today) });
    expect((await rank("mode=all")).body.period).toEqual({ mode: "all" });
    expect((await rank("mode=week")).status).toBe(400);
    expect((await rank("mode=month&key=2026-13")).status).toBe(400);
    expect((await rank("mode=semester&key=HK9")).status).toBe(400);
    expect((await rank(`mode=week&key=${week}`, t.viewer)).status).toBe(200);
    expect((await rank(`mode=week&key=${week}`, t.gvcn)).status).toBe(200);
    expect((await rank(`mode=week&key=${week}`, t.other)).status).toBe(403);
  });
});
