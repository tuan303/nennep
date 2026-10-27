/**
 * Client cache of the quy chế (GET /api/regulations: two small documents, the same for every level). Pure – no React –
 * unit-tested; `useRegulations()` (use-regulations.ts) binds it to the signed-in user.
 *
 * - `ensure(owner)` loads once per signed-in user (`owner` = uid) and browser tab; later calls reuse the result.
 *   Another user signing in on the same tab starts from scratch.
 * - `reload(owner)` refetches (the "Tải lại" buttons, a 409 on save); while something is shown a failure keeps it on
 *   screen and rejects, so the caller can toast the message.
 * - `put(owner, reg)` replaces one regulation with what a successful PUT returned (no refetch needed).
 */
import { errorMessage } from "@/lib/client/api-errors";
import type { Regulation, RegulationId } from "@/lib/types";

export type RegulationStoreStatus = "idle" | "loading" | "ready" | "error";

export interface RegulationStoreState {
  /** User the data belongs to (uid). */
  owner?: string;
  status: RegulationStoreStatus;
  /** Stored regulations by id (a regulation never saved is missing). */
  items: Partial<Record<RegulationId, Regulation>>;
  /** Load error (status "error"). */
  error?: string;
  /** An explicit reload is running. */
  reloading: boolean;
}

export interface RegulationStore {
  getState(): RegulationStoreState;
  subscribe(listener: () => void): () => void;
  ensure(owner: string): Promise<void>;
  reload(owner: string): Promise<void>;
  put(owner: string, reg: Regulation): void;
}

export const REGULATIONS_ERROR_MESSAGE = "Không tải được quy chế. Vui lòng thử lại.";

const INITIAL: RegulationStoreState = { status: "idle", items: {}, reloading: false };

/** A list older than this is refreshed quietly on the next ensure() (saves do not bump meta/versions). */
export const REGULATIONS_STALE_MS = 5 * 60_000;

export function createRegulationStore(fetchList: () => Promise<Regulation[]>, now: () => number = Date.now): RegulationStore {
  let state = INITIAL;
  let seq = 0;
  let loadedAt = 0;
  let inflight: { owner: string; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>();

  const set = (next: RegulationStoreState) => {
    state = next;
    for (const l of [...listeners]) l();
  };

  function fetchFor(owner: string, explicit: boolean): Promise<void> {
    const req = ++seq;
    const shown = state.owner === owner && state.status === "ready";
    set(shown ? { ...state, reloading: explicit } : { owner, status: "loading", items: {}, reloading: explicit });
    const promise = fetchList().then(
      (list) => {
        if (req !== seq) return;
        const items: RegulationStoreState["items"] = {};
        for (const r of list) items[r.id] = r;
        loadedAt = now();
        set({ owner, status: "ready", items, reloading: false });
      },
      (err: unknown) => {
        if (req !== seq) return;
        const message = errorMessage(err, REGULATIONS_ERROR_MESSAGE);
        if (shown) {
          set({ ...state, reloading: false });
          throw err;
        }
        set({ owner, status: "error", items: {}, error: message, reloading: false });
      },
    );
    const entry = { owner, promise };
    inflight = entry;
    void promise.finally(() => {
      if (inflight === entry) inflight = null;
    }).catch(() => undefined);
    return promise;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ensure(owner) {
      if (inflight?.owner === owner) return inflight.promise.catch(() => undefined);
      if (state.owner === owner && state.status === "ready") {
        // Another user may have changed a regulation: refresh in the background, keep showing the current text.
        if (now() - loadedAt > REGULATIONS_STALE_MS) void fetchFor(owner, false).catch(() => undefined);
        return Promise.resolve();
      }
      return fetchFor(owner, false);
    },
    reload(owner) {
      return fetchFor(owner, true);
    },
    put(owner, reg) {
      if (state.owner !== owner || state.status !== "ready") return; // the next ensure() loads everything anyway
      // A reload still in flight was fetched before this save: drop its answer rather than show an older version.
      if (inflight?.owner === owner) seq++;
      set({ ...state, items: { ...state.items, [reg.id]: reg }, reloading: false });
    },
  };
}
