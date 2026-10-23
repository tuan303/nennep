/**
 * GET /api/rankings: server-side ranking with the same engine the browser uses (BR-RANK-01…06).
 * Ranking tables follow the level's rule (engine rankingRuleOf): one per khối, or – THPT – one table for the whole
 * level (grade = LEVEL_RANKING_GROUP, rows keep their own grade; equal scores → fewer lượt vi phạm first).
 * The response only carries class aggregates, so no GVCN redaction is needed.
 */
import { z } from "zod";
import { zLevelId, type RankingsResponse } from "../../contract";
import { defaultPeriod } from "../../engine/period";
import { buildRanking } from "../../engine/ranking";
import { isIsoDate, mondayOf, todayVN } from "../../engine/dates";
import type { Period, SchoolWeek, Semester } from "../../types";
import { requireLevel, type SessionUser } from "../auth";
import { buildLevelDataset } from "../dataset";
import { Errors } from "../errors";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const RankingsQuerySchema = z.object({
  level: zLevelId,
  mode: z.preprocess(emptyToUndefined, z.enum(["all", "week", "month", "semester"]).optional()),
  key: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
  classCode: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
  grade: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(12).optional()),
});
export type RankingsQuery = z.output<typeof RankingsQuerySchema>;

/** Period from the query: no mode → current week (engine defaultPeriod); keys are validated. */
export function resolvePeriod(q: Pick<RankingsQuery, "mode" | "key">, weeks: SchoolWeek[], semesters: Semester[], today: string): Period {
  if (!q.mode) return defaultPeriod(weeks, today);
  if (q.mode === "all") return { mode: "all" };
  if (!q.key) throw Errors.validation("Thiếu tham số key cho kỳ đã chọn.");
  if (q.mode === "week") {
    if (!isIsoDate(q.key)) throw Errors.validation("Tuần không hợp lệ (cần ngày yyyy-mm-dd).");
    return { mode: "week", key: mondayOf(q.key) };
  }
  if (q.mode === "month") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.key)) throw Errors.validation("Tháng không hợp lệ (cần dạng yyyy-mm).");
    return { mode: "month", key: q.key };
  }
  if (!semesters.some((s) => s.code === q.key)) throw Errors.validation(`Học kỳ "${q.key}" không có trong cấu hình.`);
  return { mode: "semester", key: q.key };
}

/** `q.grade` only limits the per-khối tables; a level-wide ranking (THPT) always returns its single table. */
export async function getRankings(user: SessionUser, q: RankingsQuery, today: string = todayVN()): Promise<RankingsResponse> {
  requireLevel(user, q.level);
  const ds = await buildLevelDataset(q.level);
  const period = resolvePeriod(q, ds.weeks, ds.config.semesters, today);
  const ranking = buildRanking(ds, period, today, { highlightClass: q.classCode, grade: q.grade });
  return { levelId: q.level, period, countedWeeks: ranking.countedWeeks, grades: ranking.grades };
}
