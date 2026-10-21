/**
 * Recently used error codes, per level, in localStorage "nshm.recentErrors" = { "THCS": ["L01", "L04"], … }.
 * Storage access is always wrapped in try/catch (private mode, blocked storage, SSR).
 */
import { LEVEL_IDS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";

export const RECENT_ERRORS_KEY = "nshm.recentErrors";
export const RECENT_ERRORS_MAX = 8;

type RecentStore = Partial<Record<LevelId, string[]>>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Tolerant parse: anything unexpected becomes an empty store. */
export function parseRecentStore(raw: string | null | undefined): RecentStore {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    const out: RecentStore = {};
    for (const level of LEVEL_IDS) {
      const list = (data as Record<string, unknown>)[level];
      if (Array.isArray(list)) {
        out[level] = list.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 20).slice(0, RECENT_ERRORS_MAX);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Move `code` to the front, without duplicates, capped at `max`. */
export function pushRecent(list: readonly string[], code: string, max = RECENT_ERRORS_MAX): string[] {
  return [code, ...list.filter((c) => c !== code)].slice(0, max);
}

/** Recently used codes of a level, most recent first ([] when storage is unavailable). */
export function readRecentErrors(levelId: LevelId, storage: StorageLike | undefined = defaultStorage()): string[] {
  if (!storage) return [];
  try {
    return parseRecentStore(storage.getItem(RECENT_ERRORS_KEY))[levelId] ?? [];
  } catch {
    return [];
  }
}

/** Record a use of `code` for the level; returns the new list (best effort – storage errors are ignored). */
export function rememberRecentError(levelId: LevelId, code: string, storage: StorageLike | undefined = defaultStorage()): string[] {
  if (!storage) return [code];
  try {
    const store = parseRecentStore(storage.getItem(RECENT_ERRORS_KEY));
    const next = pushRecent(store[levelId] ?? [], code);
    storage.setItem(RECENT_ERRORS_KEY, JSON.stringify({ ...store, [levelId]: next }));
    return next;
  } catch {
    return [code];
  }
}
