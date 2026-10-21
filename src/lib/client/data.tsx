"use client";
/**
 * Level datasets for the UI: <DataProvider> (inside <SessionProvider>) + hooks.
 *
 * - useLevel(): selected level (persisted in localStorage "nshm.level", validated against accessible levels;
 *   GVCN default = level of the first homeroom class).
 * - useDataset(levelId?): memory cache per level, ETag revalidation, in-flight de-dup.
 *   Call `await refresh()` after your own mutations.
 * - While signed in, the browser listens to Firestore `meta/versions`; when a loaded level's version moves
 *   past the cached one, it refetches (debounced 800 ms + 0–3 s random jitter; a hidden tab waits until it is shown
 *   again). The Firestore SDK is lazy-loaded for this.
 *   While that listener is down, a visible tab polls conditional GETs every minute instead.
 * - Caches are dropped on sign-out / user change (GVCN datasets are redacted per user).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { COL, META_VERSIONS_DOC } from "@/lib/firestore-paths";
import type { LevelDataset, LevelId } from "@/lib/types";
import { api } from "./api";
import { DatasetController, pollWhileListenerDown, type DatasetStatus, type LevelEntry } from "./data-store";
import { isLevelId, readStoredLevel, resolveLevel, writeStoredLevel } from "./level-pref";
import { useSession } from "./session";

export type { DatasetStatus } from "./data-store";

const NO_ACCESS_MESSAGE = "Bạn chưa được cấp quyền xem dữ liệu của cấp học này.";
const LISTENER_RETRY_MS = 30_000;
/** Safety-net revalidation on tab focus (cheap 304s): more often when the live listener is down. */
const STALE_WHEN_LIVE_MS = 5 * 60_000;
const STALE_WHEN_OFFLINE_MS = 60_000;
/** While the listener is down, a visible tab also polls every STALE_WHEN_OFFLINE_MS for levels older than this. */
const POLL_MAX_AGE_MS = STALE_WHEN_OFFLINE_MS / 2;
/** Spreads the refetches of the school's open tabs after each write (INTEGRITY-3: dataset reads). */
const VERSION_JITTER_MS = 3_000;

function tabVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

interface DataContextValue {
  controller: DatasetController;
  enabled: boolean;
  uid?: string;
  levelId: LevelId;
  setLevelId: (levelId: LevelId) => void;
  accessibleLevels: LevelId[];
}

const DataContext = createContext<DataContextValue | null>(null);

function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("Data hooks must be used inside <DataProvider> (itself inside <SessionProvider>).");
  return ctx;
}

/** Subscribe to meta/versions (lazy Firestore import); resubscribes after errors. Returns an unsubscribe function. */
function listenVersions(controller: DatasetController): () => void {
  let stopped = false;
  let unsub: (() => void) | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const subscribe = async () => {
    try {
      const [{ getClientDb }, { doc, onSnapshot }] = await Promise.all([import("./firebase"), import("firebase/firestore")]);
      if (stopped) return;
      unsub = onSnapshot(
        doc(getClientDb(), COL.meta, META_VERSIONS_DOC),
        (snap) => controller.onVersions(snap.data() ?? {}),
        (err) => {
          if (stopped) return;
          console.warn("[data] meta/versions listener failed – falling back to refetch on focus", err.code);
          controller.setListener("error");
          unsub = undefined;
          retry = setTimeout(() => void subscribe(), LISTENER_RETRY_MS);
        },
      );
    } catch (err) {
      if (stopped) return;
      console.warn("[data] could not start meta/versions listener", err);
      controller.setListener("error");
      retry = setTimeout(() => void subscribe(), LISTENER_RETRY_MS);
    }
  };
  void subscribe();

  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    unsub?.();
    controller.setListener("off");
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [controller] = useState(() => new DatasetController(api.dataset, 800, { jitterMs: VERSION_JITTER_MS, isVisible: tabVisible }));
  const enabled = session.status === "signedIn";
  const uid = enabled ? session.profile?.uid : undefined;
  const { accessibleLevels, profile } = session;
  const [chosen, setChosen] = useState<{ uid: string; levelId: LevelId }>();

  // Drop cached data when the signed-in user changes (or signs out).
  useEffect(() => {
    if (controller.store.getState().owner !== uid) controller.reset(uid);
  }, [controller, uid]);

  // Live version listener – only while signed in.
  useEffect(() => {
    if (!enabled || !uid) return;
    return listenVersions(controller);
  }, [controller, enabled, uid]);

  // Listener down (rules missing, WebChannel blocked…): keep a continuously visible tab fresh by polling.
  useEffect(() => {
    if (!enabled) return;
    return pollWhileListenerDown(controller, {
      intervalMs: STALE_WHEN_OFFLINE_MS,
      maxAgeMs: POLL_MAX_AGE_MS,
      isVisible: () => document.visibilityState === "visible",
    });
  }, [controller, enabled]);

  // Safety net: revalidate when the tab becomes visible again or the network comes back.
  useEffect(() => {
    if (!enabled) return;
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      controller.resumeDeferred(); // versions that moved while hidden
      const live = controller.store.getState().listener === "live";
      controller.revalidateStale(live ? STALE_WHEN_LIVE_MS : STALE_WHEN_OFFLINE_MS);
    };
    const onOnline = () => controller.revalidateStale(0);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("online", onOnline);
    };
  }, [controller, enabled]);

  // Resolved during render (not in an effect) so children never fetch a wrong level first.
  // localStorage is only read once signed in, i.e. never during SSR/hydration.
  const levelId = useMemo(
    () =>
      resolveLevel({
        chosen: chosen && chosen.uid === uid ? chosen.levelId : undefined,
        stored: enabled ? readStoredLevel() : undefined,
        profile,
        accessible: accessibleLevels,
      }),
    [chosen, uid, enabled, profile, accessibleLevels],
  );

  const setLevelId = useCallback(
    (next: LevelId) => {
      if (!uid || !accessibleLevels.includes(next)) return;
      writeStoredLevel(next);
      setChosen({ uid, levelId: next });
    },
    [uid, accessibleLevels],
  );

  const value = useMemo<DataContextValue>(
    () => ({ controller, enabled, uid, levelId, setLevelId, accessibleLevels }),
    [controller, enabled, uid, levelId, setLevelId, accessibleLevels],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/* ---------------------------------- hooks ---------------------------------- */

export interface UseLevelResult {
  /** Selected level (falls back to the first accessible level). */
  levelId: LevelId;
  /** Ignored for levels the user cannot access. Persisted in localStorage "nshm.level". */
  setLevelId: (levelId: LevelId) => void;
  accessibleLevels: LevelId[];
}

export function useLevel(): UseLevelResult {
  const { levelId, setLevelId, accessibleLevels } = useDataContext();
  return useMemo(() => ({ levelId, setLevelId, accessibleLevels }), [levelId, setLevelId, accessibleLevels]);
}

export interface UseDatasetResult {
  levelId: LevelId;
  dataset?: LevelDataset;
  /** "idle" when signed out; "loading" until the first dataset arrives; "error" only when there is no data to show. */
  status: DatasetStatus;
  /** Vietnamese message of the last failure (may be set while "ready" = showing stale data). */
  error?: string;
  /** A (background) request is in flight. */
  refreshing: boolean;
  /** Conditional refetch; never rejects (failures land in `error`). Call after your own mutations. */
  refresh: () => Promise<void>;
}

interface EntryView {
  dataset?: LevelDataset;
  status: DatasetStatus;
  error?: string;
  refreshing: boolean;
}

function viewOf(entry: LevelEntry | undefined, active: boolean, accessible: boolean, enabled: boolean): EntryView {
  if (!enabled) return { status: "idle", refreshing: false };
  if (!accessible) return { status: "error", error: NO_ACCESS_MESSAGE, refreshing: false };
  if (!active || !entry) return { status: "loading", refreshing: false };
  if (entry.dataset) return { dataset: entry.dataset, status: "ready", error: entry.error, refreshing: entry.refreshing };
  if (entry.status === "error") return { status: "error", error: entry.error, refreshing: entry.refreshing };
  return { status: "loading", refreshing: entry.refreshing };
}

export function useDataset(levelId?: LevelId): UseDatasetResult {
  const ctx = useDataContext();
  const { controller, enabled, uid, accessibleLevels } = ctx;
  const level = levelId ?? ctx.levelId;
  const entry = useStore(controller.store, (s) => s.entries[level]);
  const owner = useStore(controller.store, (s) => s.owner);
  const accessible = accessibleLevels.includes(level);
  const active = enabled && uid !== undefined && owner === uid && accessible;

  useEffect(() => {
    if (active) void controller.ensure(level);
  }, [active, controller, level]);

  const refresh = useCallback(() => (active ? controller.refresh(level) : Promise.resolve()), [active, controller, level]);
  const view = viewOf(active ? entry : undefined, active, accessible, enabled);
  return { levelId: level, ...view, refresh };
}

/** Version of the cached dataset (memo key for engine calls); undefined until loaded. */
export function useDatasetVersion(levelId?: LevelId): number | undefined {
  const ctx = useDataContext();
  const level = levelId ?? ctx.levelId;
  return useStore(ctx.controller.store, (s) => (s.owner === ctx.uid ? s.entries[level]?.dataset?.version : undefined));
}

export interface UseAllDatasetsResult {
  /** Loaded datasets by level (accessible levels only). */
  datasets: Partial<Record<LevelId, LevelDataset>>;
  /** One item per requested accessible level, in request order. */
  items: Array<{ levelId: LevelId } & EntryView>;
  /** "ready" when every requested accessible level has data; "error" when none is loading and one failed without data. */
  status: DatasetStatus;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/** Several levels at once (school-wide page). Levels the user cannot access are skipped. */
export function useAllDatasets(levelIds: LevelId[]): UseAllDatasetsResult {
  const { controller, enabled, uid, accessibleLevels } = useDataContext();
  const entries = useStore(controller.store, (s) => s.entries);
  const owner = useStore(controller.store, (s) => s.owner);
  const active = enabled && uid !== undefined && owner === uid;
  const key = levelIds.filter((l) => accessibleLevels.includes(l)).join(",");
  const levels = useMemo(() => key.split(",").filter(isLevelId), [key]);

  useEffect(() => {
    if (active) for (const l of levels) void controller.ensure(l);
  }, [active, controller, levels]);

  const refresh = useCallback(
    async () => {
      if (active) await Promise.all(levels.map((l) => controller.refresh(l)));
    },
    [active, controller, levels],
  );

  return useMemo(() => {
    const items = levels.map((l) => ({ levelId: l, ...viewOf(active ? entries[l] : undefined, active, true, enabled) }));
    const datasets: Partial<Record<LevelId, LevelDataset>> = {};
    for (const it of items) if (it.dataset) datasets[it.levelId] = it.dataset;
    let status: DatasetStatus;
    if (!enabled) status = "idle";
    else if (items.length > 0 && items.every((i) => i.status === "ready")) status = "ready";
    else if (items.some((i) => i.status === "loading")) status = "loading";
    else if (items.some((i) => i.status === "error")) status = "error";
    else status = items.length === 0 ? "ready" : "loading";
    return { datasets, items, status, refreshing: items.some((i) => i.refreshing), refresh };
  }, [levels, entries, active, enabled, refresh]);
}

export interface SyncStatus {
  /** Any level request in flight. */
  refreshing: boolean;
  /** Live listener on meta/versions is connected. */
  live: boolean;
  /** Last successful sync (ms epoch) across loaded levels. */
  lastSyncedAt?: number;
  /** Error of the selected level, if any. */
  error?: string;
}

/** For the top-bar sync indicator. */
export function useSyncStatus(): SyncStatus {
  const { controller, levelId } = useDataContext();
  const refreshing = useStore(controller.store, (s) => Object.values(s.entries).some((e) => e?.refreshing === true));
  const live = useStore(controller.store, (s) => s.listener === "live");
  const lastSyncedAt = useStore(controller.store, (s) => {
    const times = Object.values(s.entries).map((e) => e?.fetchedAt ?? 0);
    const max = times.length ? Math.max(...times) : 0;
    return max > 0 ? max : undefined;
  });
  const error = useStore(controller.store, (s) => s.entries[levelId]?.error);
  return { refreshing, live, lastSyncedAt, error };
}
