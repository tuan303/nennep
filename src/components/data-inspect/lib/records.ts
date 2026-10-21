/**
 * Rewards tab and "Đã xóa" tab helpers. Whether a reward counts comes from the engine (`countedRewards`). Pure – no React.
 */
import { countedRewards } from "@/lib/engine/filters";
import { matchesSearch, normalizeVN } from "@/lib/engine/text";
import type { Incident, LevelConfig, Reward, RewardStatus } from "@/lib/types";

export interface RewardRow {
  reward: Reward;
  /** Status is in config.rewardCountedStatuses → added to the competition score. */
  counted: boolean;
}

export function rewardRows(rewards: readonly Reward[], config: LevelConfig): RewardRow[] {
  const counted = new Set(countedRewards([...rewards], config).map((r) => r.id));
  return [...rewards]
    .sort((a, b) => (a.date === b.date ? (a.code < b.code ? 1 : -1) : a.date < b.date ? 1 : -1))
    .map((reward) => ({ reward, counted: counted.has(reward.id) }));
}

export function filterRewardRows(rows: readonly RewardRow[], f: { query?: string; status?: RewardStatus | "ALL" }): RewardRow[] {
  const q = normalizeVN(f.query ?? "");
  const st = f.status ?? "ALL";
  return rows.filter(
    ({ reward: r }) =>
      (st === "ALL" || r.status === st) &&
      (!q || matchesSearch([r.code, r.classCode, r.reason, r.note ?? "", r.reporter ?? "", r.createdByName].join(" "), q)),
  );
}

export interface RewardSummary {
  count: number;
  points: number;
  countedPoints: number;
  /** Not counted yet (status outside rewardCountedStatuses). */
  pending: number;
}

export function rewardSummary(rows: readonly RewardRow[]): RewardSummary {
  let points = 0;
  let countedPoints = 0;
  let pending = 0;
  for (const { reward, counted } of rows) {
    points += reward.points;
    if (counted) countedPoints += reward.points;
    else pending += 1;
  }
  return { count: rows.length, points: Math.round(points * 100) / 100, countedPoints: Math.round(countedPoints * 100) / 100, pending };
}

export function rewardStatusCounts(rows: readonly RewardRow[]): Record<RewardStatus, number> {
  const out: Record<RewardStatus, number> = { "Mới ghi nhận": 0, "Đang xác minh": 0, "Đã xác nhận": 0 };
  for (const { reward } of rows) out[reward.status] += 1;
  return out;
}

/* --------------------------------- deleted -------------------------------- */

/** A soft-deleted incident or reward, normalised for one table. */
export interface DeletedRow {
  kind: "incident" | "reward";
  id: string;
  code: string;
  date: string;
  classCode: string;
  /** Error issue (incident) or reward reason. */
  content: string;
  /** Penalty (negative display) or reward points. */
  points: number;
  deletedAt: string;
  deletedBy: string;
  reason: string;
  incident?: Incident;
  reward?: Reward;
}

export function deletedIncidentRow(i: Incident): DeletedRow {
  return {
    kind: "incident",
    id: i.id,
    code: i.code,
    date: i.date,
    classCode: i.classCode,
    content: `${i.errorCode} · ${i.issue}`,
    points: i.points,
    deletedAt: i.deletedAt ?? "",
    deletedBy: i.deletedBy ?? "",
    reason: i.deleteReason ?? "",
    incident: i,
  };
}

export function deletedRewardRow(r: Reward): DeletedRow {
  return {
    kind: "reward",
    id: r.id,
    code: r.code,
    date: r.date,
    classCode: r.classCode,
    content: r.reason,
    points: r.points,
    deletedAt: r.deletedAt ?? "",
    deletedBy: r.deletedBy ?? "",
    reason: r.deleteReason ?? "",
    reward: r,
  };
}

/** Newest deletion first. */
export function sortDeleted(rows: readonly DeletedRow[]): DeletedRow[] {
  return [...rows].sort((a, b) => (a.deletedAt === b.deletedAt ? (a.code < b.code ? -1 : 1) : a.deletedAt < b.deletedAt ? 1 : -1));
}

/** Friendly delete reason; level resets are stored as "RESET:<batchId>". */
export function deleteReasonText(reason: string): string {
  const r = reason.trim();
  if (!r) return "Không ghi lý do";
  const m = /^RESET:(.+)$/.exec(r);
  return m ? `Đặt lại dữ liệu cấp học (lô ${m[1].trim()})` : r;
}

export function searchDeleted(rows: readonly DeletedRow[], query: string): DeletedRow[] {
  const q = normalizeVN(query);
  if (!q) return [...rows];
  return rows.filter((r) => matchesSearch([r.code, r.classCode, r.content, r.deletedBy, r.reason].join(" "), q));
}
