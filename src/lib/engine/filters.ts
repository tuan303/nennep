/** Global filter application (period + grade + class + category + error + error group + student). */
import type { GlobalFilters, Incident, LevelConfig, LevelDataset, Reward } from "../types";
import { periodMatcher } from "./period";

/**
 * Incidents matching every filter (period, grade, class, category/Mảng, error code, error group = snapshot `group`,
 * student = a named student with this Mã HS). Soft-deleted records are skipped.
 */
export function filterIncidents(ds: LevelDataset, f: GlobalFilters): Incident[] {
  const inPeriod = periodMatcher(f.period, ds.weeks);
  const hasGrade = typeof f.grade === "number";
  return ds.incidents.filter(
    (i) =>
      !i.deletedAt &&
      inPeriod(i) &&
      (!hasGrade || i.grade === f.grade) &&
      (!f.classCode || i.classCode === f.classCode) &&
      (!f.category || i.category === f.category) &&
      (!f.errorCode || i.errorCode === f.errorCode) &&
      (!f.group || i.group === f.group) &&
      (!f.studentId || i.students.some((s) => s.id === f.studentId)),
  );
}

/** Rewards matching period + grade + class (category/error/group/student filters do not apply to rewards). All statuses. */
export function filterRewards(ds: LevelDataset, f: GlobalFilters): Reward[] {
  const inPeriod = periodMatcher(f.period, ds.weeks);
  const hasGrade = typeof f.grade === "number";
  return ds.rewards.filter(
    (r) => !r.deletedAt && inPeriod(r) && (!hasGrade || r.grade === f.grade) && (!f.classCode || r.classCode === f.classCode),
  );
}

/** Rewards whose status is counted in the competition score (config.rewardCountedStatuses). */
export function countedRewards(rewards: Reward[], config: LevelConfig): Reward[] {
  const ok = new Set<string>(config.rewardCountedStatuses);
  // A GVCN proposal only counts once the school has confirmed it, whatever else the level counts.
  return rewards.filter((r) => ok.has(r.status) && (!r.proposed || r.status === "Đã xác nhận"));
}
