/** "Ghi nhận gần đây" panel: the signed-in user's latest incidents and today's counter (pure – unit-tested). */
import { todayVN } from "@/lib/engine/dates";
import type { Incident } from "@/lib/types";
import { studentDisplayName, type RosterNames } from "./student-names";

export const RECENT_LIMIT = 15;

type RecentIncident = Pick<Incident, "createdBy" | "createdAt" | "deletedAt">;

function createdMs(i: Pick<Incident, "createdAt">): number {
  const t = Date.parse(i.createdAt);
  return Number.isNaN(t) ? 0 : t;
}

/** Incidents created by `uid`, newest first (by createdAt). */
export function myRecentIncidents<T extends RecentIncident>(incidents: readonly T[], uid: string, limit = RECENT_LIMIT): T[] {
  if (!uid) return [];
  return incidents
    .filter((i) => i.createdBy === uid && !i.deletedAt)
    .sort((a, b) => createdMs(b) - createdMs(a))
    .slice(0, limit);
}

/** Vietnamese calendar day on which a record was created ("" when the timestamp is invalid). */
export function createdDayVN(i: Pick<Incident, "createdAt">): string {
  const t = Date.parse(i.createdAt);
  return Number.isNaN(t) ? "" : todayVN(new Date(t));
}

/** "Hôm nay: x sự việc · y điểm trừ" – what `uid` recorded today (VN time). */
export function myTodaySummary(incidents: readonly (RecentIncident & Pick<Incident, "points">)[], uid: string, today: string): { count: number; points: number } {
  let count = 0;
  let points = 0;
  for (const i of incidents) {
    if (i.createdBy !== uid || i.deletedAt || createdDayVN(i) !== today) continue;
    count += 1;
    points += i.points;
  }
  return { count, points: Math.round(points * 100) / 100 };
}

/**
 * Who the incident is about, compactly: "Lê Minh Châu, Trần Bảo Anh +1 · 2 HS chưa rõ tên" or "Tập thể lớp".
 * Names follow the current roster when given (corrected names), else the names recorded on the incident.
 */
export function subjectSummary(i: Pick<Incident, "students" | "unnamedCount" | "scope">, maxNames = 2, roster?: RosterNames): string {
  const names = i.students.map((s) => studentDisplayName(s, roster));
  const unnamed = Math.max(0, i.unnamedCount || 0);
  const parts: string[] = [];
  if (names.length > 0) {
    const shown = names.slice(0, maxNames).join(", ");
    parts.push(names.length > maxNames ? `${shown} +${names.length - maxNames}` : shown);
  }
  if (unnamed > 0) parts.push(`${unnamed} HS chưa rõ tên`);
  if (parts.length === 0) return i.scope === "Tập thể" ? "Tập thể lớp" : "Chưa có học sinh";
  return parts.join(" · ");
}
