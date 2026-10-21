/**
 * Dataset cache controller (framework-free; React bindings live in data.tsx).
 *
 * - One entry per level: dataset + ETag + status. "loading" only while no dataset exists; background
 *   revalidation keeps "ready" (with `refreshing`), and a failed revalidation keeps the stale dataset (+ `error`).
 * - In-flight de-duplication per level; `refresh()` called during a request queues one more conditional GET
 *   afterwards (so data written just before is never missed).
 * - `onVersions(meta/versions)`: when a loaded level's server version is newer than the cached dataset,
 *   refetch after a debounce (800 ms + a random 0–`jitterMs`, so the open tabs of a school do not all hit the server
 *   in the same second after each write). Each server version triggers at most one automatic refetch (no loops).
 *   A hidden tab does not refetch: the level is marked and fetched by `resumeDeferred()` once the tab is visible.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import { LEVEL_IDS } from "@/lib/constants";
import type { LevelDataset, LevelId } from "@/lib/types";
import { errorMessage } from "./api-errors";

export type DatasetStatus = "idle" | "loading" | "ready" | "error";

export type DatasetFetcher = (
  levelId: LevelId,
  etag?: string,
) => Promise<{ status: 200; dataset: LevelDataset; etag: string } | { status: 304 }>;

export interface LevelEntry {
  dataset?: LevelDataset;
  etag?: string;
  status: DatasetStatus;
  /** A request for this level is in flight. */
  refreshing: boolean;
  /** Vietnamese message of the last failed request (cleared on success). */
  error?: string;
  /** Date.now() of the last successful response (200 or 304). */
  fetchedAt?: number;
  failedAt?: number;
}

export type ListenerState = "off" | "live" | "error";

export interface DataState {
  /** uid the cached data belongs to (datasets are filtered per user). */
  owner?: string;
  entries: Partial<Record<LevelId, LevelEntry>>;
  serverVersions: Partial<Record<LevelId, number>>;
  listener: ListenerState;
}

export const DATASET_ERROR_MESSAGE = "Không tải được dữ liệu. Vui lòng thử lại.";
const ERROR_RETRY_MS = 5_000;

export interface DatasetControllerOptions {
  /** Extra random delay (0..jitterMs) added to the version debounce. Default 0. */
  jitterMs?: number;
  /** Random source in [0, 1) (tests). */
  random?: () => number;
  /** False while the tab is hidden: version-triggered refetches wait for `resumeDeferred()`. Default: always visible. */
  isVisible?: () => boolean;
}

export class DatasetController {
  readonly store: StoreApi<DataState>;
  private readonly inflight = new Map<LevelId, Promise<void>>();
  private readonly timers = new Map<LevelId, ReturnType<typeof setTimeout>>();
  private readonly autoTarget = new Map<LevelId, number>();
  /** Levels whose version moved while the tab was hidden (fetched by `resumeDeferred`). */
  private readonly deferred = new Set<LevelId>();
  private generation = 0;

  constructor(
    private readonly fetcher: DatasetFetcher,
    private readonly debounceMs = 800,
    private readonly opts: DatasetControllerOptions = {},
  ) {
    this.store = createStore<DataState>(() => ({ entries: {}, serverVersions: {}, listener: "off" }));
  }

  entry(levelId: LevelId): LevelEntry | undefined {
    return this.store.getState().entries[levelId];
  }

  /** Drop every cached dataset (sign-out / user change). In-flight responses are ignored. */
  reset(owner?: string): void {
    this.generation++;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.inflight.clear();
    this.autoTarget.clear();
    this.deferred.clear();
    this.store.setState({ owner, entries: {}, serverVersions: {}, listener: "off" }, true);
  }

  /** Load once: no-op when cached or in flight; retries a failed level after a short pause. */
  ensure(levelId: LevelId): Promise<void> {
    const running = this.inflight.get(levelId);
    if (running) return running;
    const e = this.entry(levelId);
    if (e?.dataset) return Promise.resolve();
    if (e?.status === "error" && e.failedAt !== undefined && Date.now() - e.failedAt < ERROR_RETRY_MS) return Promise.resolve();
    return this.load(levelId);
  }

  /** Conditional revalidation that never misses writes made before the call (queues after an in-flight request). */
  refresh(levelId: LevelId): Promise<void> {
    const running = this.inflight.get(levelId);
    if (running) return running.then(() => this.load(levelId));
    return this.load(levelId);
  }

  /** Revalidate loaded levels whose last successful fetch is older than `maxAgeMs`, and retry failed ones. */
  revalidateStale(maxAgeMs: number): void {
    const now = Date.now();
    const { entries } = this.store.getState();
    for (const levelId of LEVEL_IDS) {
      const e = entries[levelId];
      if (!e) continue;
      if (e.dataset ? now - (e.fetchedAt ?? 0) > maxAgeMs : e.status === "error") void this.load(levelId);
    }
  }

  /** The tab became visible again: fetch the levels whose version moved while it was hidden. */
  resumeDeferred(): void {
    const levels = [...this.deferred];
    this.deferred.clear();
    for (const levelId of levels) if (this.isBehind(levelId)) void this.refresh(levelId);
  }

  setListener(listener: ListenerState): void {
    if (this.store.getState().listener !== listener) this.store.setState({ listener });
  }

  /** Feed the content of meta/versions ({ TH, THCS, THPT, updatedAt }). */
  onVersions(data: unknown): void {
    if (typeof data !== "object" || data === null) return;
    const record = data as Record<string, unknown>;
    const next: Partial<Record<LevelId, number>> = { ...this.store.getState().serverVersions };
    for (const levelId of LEVEL_IDS) {
      const v = record[levelId];
      if (typeof v === "number" && Number.isFinite(v)) next[levelId] = v;
    }
    this.store.setState({ serverVersions: next, listener: "live" });
    for (const levelId of LEVEL_IDS) this.checkVersion(levelId);
  }

  private patch(levelId: LevelId, partial: Partial<LevelEntry>): void {
    this.store.setState((s) => {
      const prev: LevelEntry = s.entries[levelId] ?? { status: "idle", refreshing: false };
      return { entries: { ...s.entries, [levelId]: { ...prev, ...partial } } };
    });
  }

  private load(levelId: LevelId): Promise<void> {
    const running = this.inflight.get(levelId);
    if (running) return running;
    const gen = this.generation;
    const prev = this.entry(levelId);
    this.patch(levelId, { status: prev?.dataset ? "ready" : "loading", refreshing: true });
    const p = this.fetcher(levelId, prev?.dataset ? prev.etag : undefined).then(
      (res) => {
        if (gen !== this.generation) return;
        this.inflight.delete(levelId);
        const base = { status: "ready" as const, refreshing: false, error: undefined, fetchedAt: Date.now() };
        if (res.status === 304) this.patch(levelId, base);
        else this.patch(levelId, { ...base, dataset: res.dataset, etag: res.etag });
        this.checkVersion(levelId);
      },
      (err: unknown) => {
        if (gen !== this.generation) return;
        this.inflight.delete(levelId);
        const hasData = this.entry(levelId)?.dataset !== undefined;
        this.patch(levelId, {
          status: hasData ? "ready" : "error",
          refreshing: false,
          error: errorMessage(err, DATASET_ERROR_MESSAGE),
          failedAt: Date.now(),
        });
      },
    );
    this.inflight.set(levelId, p);
    return p;
  }

  /** The cached dataset is older than the last version announced by meta/versions. */
  private isBehind(levelId: LevelId): boolean {
    const latest = this.store.getState().serverVersions[levelId];
    const have = this.entry(levelId)?.dataset?.version;
    return latest !== undefined && have !== undefined && have < latest;
  }

  private checkVersion(levelId: LevelId): void {
    const server = this.store.getState().serverVersions[levelId];
    const cached = this.entry(levelId)?.dataset?.version;
    if (server === undefined || cached === undefined || server <= cached) return;
    if (this.autoTarget.get(levelId) === server) return; // already refetched for this version
    this.autoTarget.set(levelId, server);
    const existing = this.timers.get(levelId);
    if (existing) clearTimeout(existing);
    const jitter = this.opts.jitterMs ? Math.floor((this.opts.random ?? Math.random)() * this.opts.jitterMs) : 0;
    this.timers.set(
      levelId,
      setTimeout(() => {
        this.timers.delete(levelId);
        if (!this.isBehind(levelId)) return;
        if (this.opts.isVisible && !this.opts.isVisible()) {
          this.deferred.add(levelId); // hidden tab: no read now, fetch when it is shown again
          return;
        }
        void this.refresh(levelId);
      }, this.debounceMs + jitter),
    );
  }
}

export interface FallbackPollOptions {
  /** Poll period while the listener is down. */
  intervalMs: number;
  /** Revalidate levels whose last successful fetch is older than this. */
  maxAgeMs: number;
  /** Polls only while this returns true (visible tab). */
  isVisible: () => boolean;
}

/**
 * Safety net while the `meta/versions` listener is not live (rules not deployed, a school proxy blocking the
 * WebChannel…): a tab that simply stays visible – a wall dashboard, a focused GVCN tab – never fires focus/online
 * events, so poll `revalidateStale` (cheap 304s) on an interval instead. Paused while hidden, stopped as soon as the
 * listener is live again. Returns a stop function.
 */
export function pollWhileListenerDown(controller: DatasetController, opts: FallbackPollOptions): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const down = () => controller.store.getState().listener !== "live";
  const tick = () => {
    if (down() && opts.isVisible()) controller.revalidateStale(opts.maxAgeMs);
  };
  const sync = () => {
    if (down() && timer === undefined) timer = setInterval(tick, opts.intervalMs);
    else if (!down() && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  sync();
  const unsubscribe = controller.store.subscribe(sync);
  return () => {
    unsubscribe();
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
}
