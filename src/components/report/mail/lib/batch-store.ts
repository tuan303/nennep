/**
 * Client store of the report-mail batches being followed (pure – no React, no DOM – unit-tested with fake timers;
 * use-batch-watches.ts binds it to the signed-in user, the API and the toaster).
 *
 * The last batch sent per level (LevelWatches) lives here, not in the report screen, so it survives everything that
 * unmounts that screen: a level switch (the screen shows a skeleton while the new level loads), a level without
 * recipients or weeks, leaving Báo cáo. Each batch keeps being polled and is toasted when it finishes; reopening
 * "Gửi email" on its level shows it again. The batches belong to one signed-in user (`owner` = uid): another user, or
 * signing out, drops them with their polls.
 *
 * Polling is owned by the store, never by an effect, so React StrictMode double effects or several subscribers cannot
 * start a second poller: after every change the scheduled polls are diffed with duePolls() (one poll per polling
 * batch, keyed by batch + round – a poll answering for one batch never restarts the timer of another). A finished,
 * stopped (BATCH_POLL_MAX_MS without finishing, access lost) or removed batch keeps no timer.
 */
import { errorMessage, isAbortError, isApiClientError } from "@/lib/client/api-errors";
import { LEVELS } from "@/lib/constants";
import type { MailBatchResponse } from "@/lib/contract";
import type { LevelId } from "@/lib/types";
import {
  applyPoll,
  applyPollError,
  batchRetryHint,
  batchToast,
  duePolls,
  updateLevelWatch,
  type BatchToast,
  type BatchWatch,
  type LevelWatches,
} from "./mail-batch";

export interface BatchStoreState {
  /** User the batches belong to (uid); undefined: nobody signed in (no batch is kept). */
  owner?: string;
  /** The last batch sent per level by `owner`. */
  watches: LevelWatches;
}

export interface BatchStoreDeps {
  /** GET /api/mail/batches/:id (rejects with ApiClientError; aborted with `signal` when the poll is cancelled). */
  fetchBatch: (batchId: string, signal: AbortSignal) => Promise<MailBatchResponse>;
  /** Shows the toast of a finished batch. */
  announce: (toast: BatchToast) => void;
  /** Clock (default Date.now). */
  now?: () => number;
}

export interface BatchStore {
  getState(): BatchStoreState;
  subscribe(listener: () => void): () => void;
  /** The signed-in user (uid; undefined when signed out). Another user drops every batch and cancels its poll. */
  setOwner(owner: string | undefined): void;
  /**
   * Replaces the watch of `levelId` by fn(it) (undefined removes it), then (re)schedules the polls. Ignored unless
   * `owner` is the current owner (a send answered after a sign-out / account switch).
   */
  update(owner: string, levelId: LevelId, fn: (w: BatchWatch | undefined) => BatchWatch | undefined): void;
  /**
   * The report page shows `levelId` (also while that level loads): toasts of batches of other levels say to switch
   * level first (batchRetryHint). Returns the release (only the latest registration counts).
   */
  view(levelId: LevelId): () => void;
  /** Keys ("batch#round") of the polls scheduled or in flight. */
  activePolls(): string[];
}

const EMPTY: BatchStoreState = { watches: {} };

export function createBatchStore(deps: BatchStoreDeps): BatchStore {
  const now = deps.now ?? (() => Date.now());
  let state = EMPTY;
  let viewing: { levelId: LevelId } | undefined;
  /** Cancel function of each scheduled / running poll, by duePolls key. */
  const polls = new Map<string, () => void>();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const l of [...listeners]) l();
  };

  function cancelAll(): void {
    for (const cancel of polls.values()) cancel();
    polls.clear();
  }

  /** One poll per polling batch: cancel the ones no longer due, start the new ones, keep the others' timers. */
  function syncPolls(): void {
    const due = duePolls(state.watches);
    for (const [key, cancel] of polls) {
      if (due.has(key)) continue;
      cancel();
      polls.delete(key);
    }
    for (const [key, w] of due) if (!polls.has(key)) polls.set(key, startPoll(w));
  }

  function setWatches(watches: LevelWatches): void {
    if (watches === state.watches) return;
    state = { ...state, watches };
    syncPolls();
    emit();
  }

  /** Applies a poll's outcome to the watch it was scheduled for; false when that watch was replaced meanwhile. */
  function settle(polled: BatchWatch, fn: (w: BatchWatch) => BatchWatch): boolean {
    const cur = state.watches[polled.levelId];
    if (cur?.batchId !== polled.batchId || cur.round !== polled.round) return false;
    setWatches(updateLevelWatch(state.watches, polled.levelId, () => fn(cur)));
    return true;
  }

  function startPoll(w: BatchWatch): () => void {
    const ctrl = new AbortController();
    const run = () => {
      Promise.resolve()
        .then(() => deps.fetchBatch(w.batchId, ctrl.signal))
        .then(
          (res) => {
            if (ctrl.signal.aborted) return;
            if (!settle(w, (cur) => applyPoll(cur, res, now())) || !res.done) return;
            // The level too: the toast may come while the page shows another level (or another page).
            deps.announce(batchToast(res, `${w.periodLabel} · ${LEVELS[w.levelId].short}`, batchRetryHint(w.levelId, viewing?.levelId)));
          },
          (err: unknown) => {
            if (ctrl.signal.aborted || isAbortError(err)) return;
            const status = isApiClientError(err) ? err.status : 0;
            settle(w, (cur) => applyPollError(cur, { status, message: errorMessage(err) }, now()));
          },
        );
    };
    const timer = setTimeout(run, w.delayMs);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOwner(owner) {
      if (owner === state.owner) return;
      cancelAll();
      state = owner ? { owner, watches: {} } : EMPTY;
      emit();
    },
    update(owner, levelId, fn) {
      if (!owner || owner !== state.owner) return;
      setWatches(updateLevelWatch(state.watches, levelId, fn));
    },
    view(levelId) {
      const entry = { levelId };
      viewing = entry;
      return () => {
        if (viewing === entry) viewing = undefined;
      };
    },
    activePolls: () => [...polls.keys()],
  };
}
