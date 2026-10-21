"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { Incident } from "@/lib/types";

export type EditTarget =
  | { status: "idle"; id: null }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; incident: Incident }
  | { status: "error"; id: string; error: string };

interface Loaded {
  id: string;
  incident?: Incident;
  error?: string;
}

/** Loads the incident of `?edit=<id>` with api.incidents.get (fresh server copy); `retry()` after an error. */
export function useEditTarget(id: string | null): EditTarget & { retry: () => void } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoaded(null);
    api.incidents.get(id).then(
      (incident) => {
        if (alive) setLoaded({ id, incident });
      },
      (err: unknown) => {
        if (alive) setLoaded({ id, error: errorMessage(err, "Không tải được sự việc cần sửa. Vui lòng thử lại.") });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!id) return { status: "idle", id: null, retry };
  if (!loaded || loaded.id !== id) return { status: "loading", id, retry };
  if (loaded.incident) return { status: "ready", id, incident: loaded.incident, retry };
  return { status: "error", id, error: loaded.error ?? "Không tải được sự việc cần sửa.", retry };
}
