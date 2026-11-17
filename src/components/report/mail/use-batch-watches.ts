"use client";
/**
 * The report-mail batches of the signed-in user (lib/batch-store.ts) bound to React, the API and the toaster. One store
 * per browser tab: its polls and toasts run whether or not a report screen is mounted. It follows Firebase sign-in
 * (from the first use on), so signing out or switching account drops the batches and their polls even while no report
 * screen is mounted; the hook also hands it the uid of the loaded profile and only ever shows batches of that uid.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { toast } from "@/components/ui";
import { getClientAuth } from "@/lib/client/firebase-core";
import { useSession } from "@/lib/client/session";
import type { LevelId } from "@/lib/types";
import { createBatchStore, type BatchStoreState } from "./lib/batch-store";
import type { BatchToast, BatchWatch, LevelWatches } from "./lib/mail-batch";
import { reportMailApi } from "./mail-api";

function announce(t: BatchToast): void {
  const opts = t.description ? { description: t.description } : undefined;
  if (t.kind === "success") toast.success(t.title, opts);
  else if (t.kind === "warning") toast.warning(t.title, opts);
  else toast.error(t.title, opts);
}

const store = createBatchStore({ fetchBatch: (batchId, signal) => reportMailApi.batch(batchId, signal), announce });

let followingSignIn = false;

/** Drops the batches on sign-out / another account (Firebase reports the current user at once, then every change). */
function followSignIn(): void {
  if (followingSignIn) return;
  try {
    onIdTokenChanged(getClientAuth(), (user) => store.setOwner(user?.uid));
    followingSignIn = true;
  } catch {
    // Firebase is not configured: nobody can sign in, the session shows its own error.
  }
}

const SERVER_STATE: BatchStoreState = { watches: {} };
const NO_WATCHES: LevelWatches = {};

export interface BatchWatches {
  /** The last batch sent per level by the signed-in user ({} while the profile loads). */
  watches: LevelWatches;
  /** Replaces the watch of a level (undefined removes it); polling follows on its own. */
  update: (levelId: LevelId, fn: (w: BatchWatch | undefined) => BatchWatch | undefined) => void;
}

export function useBatchWatches(): BatchWatches {
  const owner = useSession().profile?.uid;
  useEffect(() => {
    followSignIn();
    if (owner) store.setOwner(owner);
  }, [owner]);
  const state = useSyncExternalStore(store.subscribe, store.getState, () => SERVER_STATE);
  const watches = owner && state.owner === owner ? state.watches : NO_WATCHES;
  const update = useCallback<BatchWatches["update"]>(
    (levelId, fn) => {
      if (owner) store.update(owner, levelId, fn);
    },
    [owner],
  );
  return { watches, update };
}

/** The report page shows `levelId` (toast hints of batches of other levels say to switch level first). */
export function useReportMailView(levelId: LevelId): void {
  useEffect(() => store.view(levelId), [levelId]);
}
