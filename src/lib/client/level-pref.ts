/**
 * Selected level ("cấp học") preference: persisted per device in localStorage["nshm.level"],
 * always validated against the user's accessible levels.
 */
import { LEVEL_IDS } from "@/lib/constants";
import type { LevelId, UserProfile } from "@/lib/types";

export const LEVEL_STORAGE_KEY = "nshm.level";
export const FALLBACK_LEVEL: LevelId = "THCS";

export function isLevelId(v: unknown): v is LevelId {
  return typeof v === "string" && (LEVEL_IDS as string[]).includes(v);
}

export function readStoredLevel(): LevelId | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const v = window.localStorage.getItem(LEVEL_STORAGE_KEY);
    return isLevelId(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredLevel(levelId: LevelId): void {
  try {
    window.localStorage.setItem(LEVEL_STORAGE_KEY, levelId);
  } catch {
    // private mode / storage disabled: preference simply not remembered
  }
}

/**
 * Pick the level to show: explicit choice → stored preference → (GVCN) level of the first homeroom class
 * → first accessible level → FALLBACK_LEVEL (only when nothing is accessible).
 */
export function resolveLevel(args: {
  chosen?: LevelId;
  stored?: LevelId;
  profile?: Pick<UserProfile, "role" | "gvcnClasses">;
  accessible: LevelId[];
}): LevelId {
  const { chosen, stored, profile, accessible } = args;
  if (chosen && accessible.includes(chosen)) return chosen;
  if (stored && accessible.includes(stored)) return stored;
  if (profile?.role === "GVCN") {
    const own = profile.gvcnClasses.find((c) => accessible.includes(c.levelId));
    if (own) return own.levelId;
  }
  return accessible[0] ?? FALLBACK_LEVEL;
}
