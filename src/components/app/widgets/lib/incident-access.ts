/**
 * Client-side visibility of incident actions (the server enforces the same rules – §3 "Edit rights").
 * Pure – unit-tested.
 */
import { EDITOR_EDIT_WINDOW_HOURS, canSeeClassDetail, hasPermission, isGvcnOfClass } from "@/lib/constants";
import type { Incident, LevelDataset, UserProfile } from "@/lib/types";

const HOUR_MS = 3_600_000;

export type AccessProfile = Pick<UserProfile, "uid" | "role" | "active" | "levels" | "gvcnClasses">;
type AccessIncident = Pick<Incident, "levelId" | "classCode" | "createdBy" | "createdAt" | "deletedAt">;

/** Milliseconds left in the editor's 24h window (≤ 0 when expired or the timestamp is invalid). */
export function editWindowRemainingMs(incident: Pick<Incident, "createdAt">, nowMs: number): number {
  const created = Date.parse(incident.createdAt);
  if (Number.isNaN(created)) return 0;
  return created + EDITOR_EDIT_WINDOW_HOURS * HOUR_MS - nowMs;
}

/** ADMIN: any record. EDITOR: own records within EDITOR_EDIT_WINDOW_HOURS. Never for soft-deleted records. */
export function canEditIncident(profile: AccessProfile | null | undefined, incident: AccessIncident, nowMs: number): boolean {
  if (!profile || !profile.active || incident.deletedAt) return false;
  if (hasPermission(profile, "record.editAny")) return true;
  return (
    hasPermission(profile, "record.editOwnRecent") &&
    incident.createdBy === profile.uid &&
    editWindowRemainingMs(incident, nowMs) > 0
  );
}

/** Editing needs the 24h window (not an admin override). */
export function isTimeLimitedEdit(profile: AccessProfile | null | undefined): boolean {
  return !!profile && !hasPermission(profile, "record.editAny");
}

/** GVCN of the incident's class, or ADMIN (contract: POST /api/incidents/:id/feedback). */
export function canGiveFeedback(profile: AccessProfile | null | undefined, incident: AccessIncident): boolean {
  if (!profile || incident.deletedAt || !hasPermission(profile, "incident.gvcnFeedback")) return false;
  return profile.role === "ADMIN" || isGvcnOfClass(profile, incident.levelId, incident.classCode);
}

export function canDeleteIncident(profile: AccessProfile | null | undefined, incident: AccessIncident): boolean {
  return !incident.deletedAt && hasPermission(profile, "record.delete");
}

export function canRestoreIncident(profile: AccessProfile | null | undefined, incident: AccessIncident): boolean {
  return !!incident.deletedAt && hasPermission(profile, "record.delete");
}

/**
 * Student names / detail / notes / evidence of this incident were stripped for the viewer
 * (GVCN dataset, class that is not theirs).
 */
export function isIncidentRedacted(
  ds: Pick<LevelDataset, "redacted">,
  incident: Pick<Incident, "levelId" | "classCode">,
  profile: AccessProfile | null | undefined,
): boolean {
  return ds.redacted && !canSeeClassDetail(profile, incident.levelId, incident.classCode);
}

/** "còn 5 giờ" / "còn 40 phút" for the editor's remaining edit window. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "đã hết hạn";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `còn ${minutes} phút`;
  return `còn ${Math.floor(minutes / 60)} giờ`;
}
