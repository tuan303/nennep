/**
 * School-week calendar rules shared by records, imports and settings.
 * The dataset only loads the digests of the calendar weeks (`LevelReference.weeks`), so a record whose week is not
 * in the calendar would be stored but invisible everywhere (dataset, rankings, exports). Therefore:
 *  - incidents / rewards are only recorded (created, re-dated, imported) on dates whose Monday is a calendar week;
 *  - a soft-deleted record can only be restored while its week is still in the calendar;
 *  - removing calendar weeks that still hold records needs an explicit confirmation (`allowHidingRecords`).
 */
import { formatDateVN } from "../engine/dates";
import { calendarDateProblem, outsideCalendarMessage } from "../engine/period";
import type { Incident, LevelId, Reward, SchoolWeek } from "../types";
import { Errors } from "./errors";
import { loadIncidentDigests, loadRewardDigests } from "./digests";
import type { Reader } from "./write";

export const CALENDAR_MSG = {
  outside: outsideCalendarMessage,
  restoreOutside: (week: string) =>
    `Tuần ${formatDateVN(week)} của bản ghi này không còn trong lịch tuần của năm học nên bản ghi sẽ không hiển thị. ` +
    "Hãy thêm lại tuần đó trong Cài đặt → Lịch tuần trước khi khôi phục.",
} as const;

export function calendarWeekSet(weeks: readonly SchoolWeek[]): Set<string> {
  return new Set(weeks.map((w) => w.weekStart));
}

/** Message when a (valid) date falls outside the calendar weeks; undefined when inside or not a valid date (shared with the forms). */
export const calendarProblem = calendarDateProblem;

/** 409 when a soft-deleted record's week is no longer a calendar week (restoring it would hide it). */
export function assertRestorableWeek(week: string, weeks: readonly SchoolWeek[]): void {
  if (!weeks.some((w) => w.weekStart === week)) throw Errors.conflict(CALENDAR_MSG.restoreOutside(week));
}

export interface HiddenRecords {
  weeks: string[];
  incidents: string[];
  rewards: string[];
}

const SAMPLE = 15;

/**
 * READ: live records of the weeks that `after` drops from `before` (incident week digests + reward digests).
 * Throws 409 listing them unless `allow`; returns what will be hidden (for the audit).
 */
export async function checkRemovedWeeks(
  reader: Reader,
  levelId: LevelId,
  before: readonly SchoolWeek[],
  after: readonly SchoolWeek[],
  allow: boolean | undefined,
): Promise<HiddenRecords> {
  const kept = calendarWeekSet(after);
  const removed = before.map((w) => w.weekStart).filter((w) => !kept.has(w));
  if (removed.length === 0) return { weeks: [], incidents: [], rewards: [] };
  const [inc, rew] = await Promise.all([loadIncidentDigests(reader, levelId, removed), loadRewardDigests(reader, levelId, removed)]);
  const removedSet = new Set(removed);
  const incidents = [...inc.drafts.values()].flatMap((d) => d.items.map((i: Incident) => i.code));
  const rewards = rew.items().filter((r: Reward) => removedSet.has(r.week)).map((r) => r.code);
  const hidden = { weeks: removed, incidents, rewards };
  if (allow || (incidents.length === 0 && rewards.length === 0)) return hidden;
  const sample = [...incidents, ...rewards].slice(0, SAMPLE);
  throw Errors.conflict(
    `Các tuần bị bỏ khỏi lịch còn ${incidents.length} sự việc và ${rewards.length} điểm thưởng (ví dụ: ${sample.join(", ")}${
      incidents.length + rewards.length > SAMPLE ? ", …" : ""
    }). Sau khi bỏ, các bản ghi này sẽ không còn hiển thị trong thống kê, xếp hạng và file xuất. ` +
      "Nếu là tuần nghỉ, hãy đặt tuần đó là “Không tính” thay vì xóa; nếu đang chuyển năm học, hãy xác nhận để tiếp tục.",
    { weeks: removed, incidents: incidents.slice(0, 200), rewards: rewards.slice(0, 200) },
  );
}
