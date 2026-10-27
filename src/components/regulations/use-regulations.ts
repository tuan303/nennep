"use client";
/**
 * The quy chế of the school for the signed-in user: loaded once per user and tab (regulation-store.ts), shared by every
 * mounted reader, updated in place after a save.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import type { Regulation, RegulationId } from "@/lib/types";
import { createRegulationStore, type RegulationStoreStatus } from "./lib/regulation-store";

const store = createRegulationStore(async () => (await api.regulations.list()).items);

export interface UseRegulationsResult {
  status: RegulationStoreStatus;
  error?: string;
  /** Stored regulation, undefined when never saved (or while loading). */
  get: (id: RegulationId) => Regulation | undefined;
  reloading: boolean;
  /** Refetch; resolves with the stored regulations, rejects (keeping what is shown) when it fails. */
  reload: () => Promise<Partial<Record<RegulationId, Regulation>>>;
  /** Put the regulation a successful PUT returned in place. */
  put: (reg: Regulation) => void;
}

export function useRegulations(): UseRegulationsResult {
  const owner = useSession().profile?.uid;
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  useEffect(() => {
    if (owner) void store.ensure(owner);
  }, [owner]);

  const mine = !!owner && state.owner === owner;
  const items = mine ? state.items : undefined;
  const get = useCallback((id: RegulationId) => items?.[id], [items]);
  const reload = useCallback(async () => {
    if (!owner) return {};
    await store.reload(owner);
    const now = store.getState();
    return now.owner === owner ? now.items : {};
  }, [owner]);
  const put = useCallback(
    (reg: Regulation) => {
      if (owner) store.put(owner, reg);
    },
    [owner],
  );

  return {
    status: mine ? state.status : "loading",
    error: mine ? state.error : undefined,
    get,
    reloading: mine && state.reloading,
    reload,
    put,
  };
}
