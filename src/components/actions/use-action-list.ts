"use client";
/**
 * Action Register data: GET /api/actions?level= (actions are not part of LevelDataset).
 * Reloads on level change, on dataset version change (another tab/user wrote something), when the tab becomes
 * visible again, and after own mutations (`reload()` / `upsert()`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useDatasetVersion } from "@/lib/client/data";
import type { ActionItem, LevelId } from "@/lib/types";

export interface ActionListState {
  items?: ActionItem[];
  /** "loading" only until the first list of this level arrives. */
  status: "loading" | "ready" | "error";
  error?: string;
  refreshing: boolean;
  reload: () => Promise<void>;
  /** Put a record returned by create/update into the list right away (the reload follows). */
  upsert: (item: ActionItem) => void;
}

interface State {
  levelId: LevelId;
  items?: ActionItem[];
  error?: string;
  refreshing: boolean;
}

const FOCUS_RELOAD_MIN_MS = 30_000;

export function useActionList(levelId: LevelId): ActionListState {
  const version = useDatasetVersion(levelId);
  const [state, setState] = useState<State>({ levelId, refreshing: true });
  const seq = useRef(0);
  const lastLoad = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    lastLoad.current = Date.now();
    setState((s) => (s.levelId === levelId ? { ...s, refreshing: true } : { levelId, refreshing: true }));
    try {
      const res = await api.actions.list(levelId);
      if (id === seq.current) setState({ levelId, items: res.items, refreshing: false });
    } catch (err) {
      if (id === seq.current) {
        setState((s) => ({ levelId, items: s.levelId === levelId ? s.items : undefined, refreshing: false, error: errorMessage(err) }));
      }
    }
  }, [levelId]);

  useEffect(() => {
    void reload();
  }, [reload, version]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > FOCUS_RELOAD_MIN_MS) void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const upsert = useCallback(
    (item: ActionItem) => {
      setState((s) => {
        if (s.levelId !== levelId || item.levelId !== levelId) return s;
        const list = s.items ?? [];
        const idx = list.findIndex((i) => i.id === item.id);
        const items = idx >= 0 ? list.map((i) => (i.id === item.id ? item : i)) : [item, ...list];
        return { ...s, items };
      });
    },
    [levelId],
  );

  const current = state.levelId === levelId ? state : { levelId, refreshing: true, items: undefined, error: undefined };
  const status: ActionListState["status"] = current.items ? "ready" : current.error && !current.refreshing ? "error" : "loading";
  return { items: current.items, status, error: current.error, refreshing: current.refreshing, reload, upsert };
}
