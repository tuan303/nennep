"use client";
import { useCallback, useMemo, useState } from "react";
import { stableJson } from "../lib/draft";

export interface DraftState<T> {
  draft: T;
  setDraft: (next: T | ((cur: T) => T)) => void;
  /** Snapshot the draft started from (last saved version). */
  base: T;
  dirty: boolean;
  /** The server data changed while the user had unsaved edits (someone else saved). */
  stale: boolean;
  /** Back to `base` (Hoàn tác). */
  reset: () => void;
  /** Drop the edits and start from the newest server data. */
  reload: () => void;
  /** After a successful save: the current draft becomes the new base. */
  markSaved: () => void;
}

interface Internal<T> {
  base: T;
  baseKey: string;
  draft: T;
  latest: T;
  latestKey: string;
}

/**
 * Editable copy of server data with dirty detection. When the source changes (dataset refetch) and there are no
 * edits, the draft follows it; with edits pending the draft is kept and `stale` turns true.
 */
export function useDraft<T>(source: T): DraftState<T> {
  const sourceKey = stableJson(source);
  const [s, setS] = useState<Internal<T>>(() => ({ base: source, baseKey: sourceKey, draft: source, latest: source, latestKey: sourceKey }));

  let state = s;
  if (s.latestKey !== sourceKey) {
    const isDirty = stableJson(s.draft) !== s.baseKey;
    state = isDirty
      ? { ...s, latest: source, latestKey: sourceKey }
      : { base: source, baseKey: sourceKey, draft: source, latest: source, latestKey: sourceKey };
    setS(state); // adjust state while rendering (React "derived state" pattern)
  }

  const draftKey = useMemo(() => stableJson(state.draft), [state.draft]);
  const dirty = draftKey !== state.baseKey;

  const setDraft = useCallback((next: T | ((cur: T) => T)) => {
    setS((cur) => ({ ...cur, draft: typeof next === "function" ? (next as (c: T) => T)(cur.draft) : next }));
  }, []);
  const reset = useCallback(() => setS((cur) => ({ ...cur, draft: cur.base })), []);
  const reload = useCallback(() => setS((cur) => ({ ...cur, base: cur.latest, baseKey: cur.latestKey, draft: cur.latest })), []);
  const markSaved = useCallback(() => setS((cur) => ({ ...cur, base: cur.draft, baseKey: stableJson(cur.draft) })), []);

  return {
    draft: state.draft,
    setDraft,
    base: state.base,
    dirty,
    stale: dirty && state.latestKey !== state.baseKey,
    reset,
    reload,
    markSaved,
  };
}
