/**
 * "Điểm thưởng trong kỳ" list: rows filtered by the global period/grade/class (engine filterRewards), counted flag
 * (engine countedRewards), summary chips and per-row permissions. Pure – unit-tested.
 */
import { canEditIncident, type AccessProfile } from "@/components/app/widgets/lib/incident-access";
import { hasPermission } from "@/lib/constants";
import { countedRewards, filterRewards } from "@/lib/engine";
import type { GlobalFilters, LevelConfig, LevelDataset, Reward, RewardStatus } from "@/lib/types";
import { VERIFIED_REWARD_STATUS } from "./reward-form";

export interface RewardRow {
  reward: Reward;
  /** Counted in the competition score (status in config.rewardCountedStatuses). */
  counted: boolean;
}

/** Newest first (date, then code). */
export function rewardRows(ds: LevelDataset, filters: GlobalFilters): RewardRow[] {
  const rewards = filterRewards(ds, filters);
  const counted = new Set(countedRewards(rewards, ds.config).map((r) => r.id));
  return rewards
    .map((reward) => ({ reward, counted: counted.has(reward.id) }))
    .sort((a, b) => (a.reward.date === b.reward.date ? b.reward.code.localeCompare(a.reward.code) : b.reward.date.localeCompare(a.reward.date)));
}

export interface RewardSummary {
  total: number;
  /** Points of rewards with status "Đã xác nhận". */
  verifiedPoints: number;
  verifiedCount: number;
  /** Rewards still waiting for verification ("Mới ghi nhận" or "Đang xác minh"). */
  pendingCount: number;
  /** Points that actually count in the competition score (config.rewardCountedStatuses). */
  countedPoints: number;
}

export function rewardSummary(rows: readonly RewardRow[]): RewardSummary {
  const s: RewardSummary = { total: rows.length, verifiedPoints: 0, verifiedCount: 0, pendingCount: 0, countedPoints: 0 };
  for (const { reward, counted } of rows) {
    if (reward.status === VERIFIED_REWARD_STATUS) {
      s.verifiedCount += 1;
      s.verifiedPoints += reward.points;
    } else s.pendingCount += 1;
    if (counted) s.countedPoints += reward.points;
  }
  s.verifiedPoints = Math.round(s.verifiedPoints * 100) / 100;
  s.countedPoints = Math.round(s.countedPoints * 100) / 100;
  return s;
}

/** Counted statuses as Vietnamese text for the notice: “Đã xác nhận”, or “A”, “B” hoặc “C”. */
export function countedStatusesText(config: Pick<LevelConfig, "rewardCountedStatuses">): string {
  const list = config.rewardCountedStatuses.map((s) => `“${s}”`);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} hoặc ${list[list.length - 1]}`;
}

type CountedConfig = Pick<LevelConfig, "rewardCountedStatuses">;

const NONE_COUNTED = "Hiện chưa có trạng thái điểm thưởng nào được cộng vào điểm thi đua (xem Cài đặt).";

/** KPI hint: “Chỉ tính điểm thưởng ở trạng thái “Đã xác nhận”.” – follows config.rewardCountedStatuses. */
export function countedRewardHint(config: CountedConfig): string {
  const statuses = countedStatusesText(config);
  return statuses ? `Chỉ tính điểm thưởng ở trạng thái ${statuses}.` : NONE_COUNTED;
}

/** Reward term of a score formula: “Điểm thưởng (trạng thái “Đã xác nhận”)”. */
export function countedRewardTerm(config: CountedConfig): string {
  const statuses = countedStatusesText(config);
  return statuses ? `Điểm thưởng (trạng thái ${statuses})` : "Điểm thưởng (hiện chưa có trạng thái nào được tính)";
}

/** Note under a list that also shows rewards not counted yet (they carry a status badge). */
export function uncountedRewardNote(config: CountedConfig): string {
  const statuses = countedStatusesText(config);
  return statuses ? `Khoản thưởng có nhãn trạng thái chưa được cộng vào điểm thi đua (chỉ tính trạng thái ${statuses}).` : NONE_COUNTED;
}

/** ADMIN any time; EDITOR own records within 24h and never once verified (server rule). */
export function canEditReward(profile: AccessProfile | null | undefined, reward: Reward, nowMs: number): boolean {
  if (!canEditIncident(profile, reward, nowMs)) return false;
  return reward.status !== VERIFIED_REWARD_STATUS || hasPermission(profile, "reward.verify");
}

export function canDeleteReward(profile: AccessProfile | null | undefined, reward: Pick<Reward, "deletedAt">): boolean {
  return !reward.deletedAt && hasPermission(profile, "record.delete");
}

export interface QuickStatusAction {
  to: RewardStatus;
  label: string;
}

/** Quick workflow buttons for verifiers: "Chuyển Đang xác minh" (from Mới ghi nhận) and "Xác nhận". */
export function quickStatusActions(profile: AccessProfile | null | undefined, reward: Pick<Reward, "status" | "deletedAt">): QuickStatusAction[] {
  if (reward.deletedAt || !hasPermission(profile, "reward.verify")) return [];
  const out: QuickStatusAction[] = [];
  if (reward.status === "Mới ghi nhận") out.push({ to: "Đang xác minh", label: "Chuyển Đang xác minh" });
  if (reward.status !== VERIFIED_REWARD_STATUS) out.push({ to: VERIFIED_REWARD_STATUS, label: "Xác nhận" });
  return out;
}
