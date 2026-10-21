/**
 * RULES-1 / INTEGRITY-7: removing calendar weeks that still hold records (Lịch tuần → save / "Tạo lại từ cấu hình",
 * or a config change while the calendar follows the config) is refused with 409 CONFLICT and
 * `details: { weeks, incidents, rewards }`. The admin may confirm and repeat the same request with
 * `allowHidingRecords` (e.g. at the school-year rollover). Pure – unit-tested.
 */
import { ApiClientError } from "@/lib/client/api-errors";
import { formatDateVN } from "@/lib/engine/dates";

export interface HiddenRecordsConflict {
  /** Server message (counts + examples + advice), shown as is. */
  message: string;
  /** Mondays of the removed weeks. */
  weeks: string[];
  /** Codes of the records that would disappear (the server sends at most 200 of each). */
  incidents: string[];
  rewards: string[];
}

function stringList(v: unknown): string[] | undefined {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
}

/** The 409 "weeks still hold records" refusal, or undefined for any other error. */
export function hiddenRecordsConflict(err: unknown): HiddenRecordsConflict | undefined {
  if (!(err instanceof ApiClientError) || err.status !== 409) return undefined;
  const d = err.details;
  if (typeof d !== "object" || d === null) return undefined;
  const rec = d as Record<string, unknown>;
  const weeks = stringList(rec.weeks);
  const incidents = stringList(rec.incidents);
  const rewards = stringList(rec.rewards);
  if (!weeks || !incidents || !rewards) return undefined;
  return { message: err.message, weeks, incidents, rewards };
}

/** "3 tuần: 05/05/2025, 12/05/2025, 19/05/2025" (at most `max` dates, then "…"). */
export function removedWeeksText(weeks: readonly string[], max = 6): string {
  const shown = [...weeks].sort().slice(0, max).map(formatDateVN);
  return `${weeks.length} tuần: ${shown.join(", ")}${weeks.length > max ? ", …" : ""}`;
}
