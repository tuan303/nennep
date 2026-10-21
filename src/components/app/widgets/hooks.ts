"use client";
/** Small hooks shared by the widgets. */
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";

/**
 * Last non-null value: lets a sheet keep showing its content while it animates closed
 * after the parent set the selection back to null.
 */
export function useRetained<T>(value: T | null | undefined): T | undefined {
  const [kept, setKept] = useState<T | undefined>(value ?? undefined);
  if (value != null && value !== kept) setKept(value);
  return value ?? kept;
}

/** Date.now(), refreshed every `intervalMs` (for "còn 5 giờ để sửa"). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export type EvidenceUrlState =
  | { status: "loading"; url?: undefined; error?: undefined }
  | { status: "ready"; url: string; error?: undefined }
  | { status: "error"; url?: undefined; error: string };

/**
 * Authenticated `blob:` URL of an evidence photo (api.evidence.objectUrl caches per id).
 * `localUrl` (e.g. the preview of a photo just uploaded) skips the network.
 */
export function useEvidenceUrl(id: string, localUrl?: string): EvidenceUrlState & { retry: () => void } {
  const [state, setState] = useState<EvidenceUrlState>(localUrl ? { status: "ready", url: localUrl } : { status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (localUrl) {
      setState({ status: "ready", url: localUrl });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    api.evidence.objectUrl(id).then(
      (url) => {
        if (alive) setState({ status: "ready", url });
      },
      (err: unknown) => {
        if (alive) setState({ status: "error", error: errorMessage(err, "Không tải được ảnh.") });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, localUrl, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
