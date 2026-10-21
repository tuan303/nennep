"use client";
/** Hooks of the Quản lý học sinh screen: mutations with toast + refresh, full student record, dialog form state. */
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "@/components/ui";
import { api, errorMessage, fieldErrors, isApiClientError } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import type { LevelId, Student } from "@/lib/types";
import { knownFieldErrors, type FormErrors } from "./lib/forms";

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs a student mutation: pending flag, success toast, then awaits the dataset refresh.
 * Errors are toasted (unless `silentError`) and returned so dialogs can map them to fields.
 */
export function useStudentMutation(levelId: LevelId) {
  const { refresh } = useDataset(levelId);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success: (value: T) => string, opts: { silentError?: (err: unknown) => boolean } = {}): Promise<MutationResult<T>> => {
      setPending(true);
      try {
        const value = await fn();
        toast.success(success(value));
        await refresh();
        return { ok: true, value };
      } catch (error) {
        if (!opts.silentError?.(error)) toast.error(errorMessage(error));
        return { ok: false, error };
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  return { run, pending };
}

export type RecordState = { status: "idle" | "loading" } | { status: "ready"; student: Student } | { status: "error"; error: string };

/**
 * Full student document (history, gender, note…) loaded on demand via api.students.get.
 * Reloads when `version` (dataset version) changes so the timeline follows mutations.
 */
export function useStudentRecord(id: string | null | undefined, version: number): RecordState & { reload: () => void } {
  const [state, setState] = useState<RecordState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState((s) => (s.status === "ready" && s.student.id === id ? s : { status: "loading" }));
    api.students
      .get(id)
      .then((student) => {
        if (!cancelled) setState({ status: "ready", student });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", error: errorMessage(err, "Không tải được hồ sơ học sinh.") });
      });
    return () => {
      cancelled = true;
    };
  }, [id, version, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}

/**
 * Form state that resets every time the dialog opens (or opens for another record).
 * Uses the "adjust state while rendering" pattern, so the first open frame already shows fresh values.
 */
export function useDialogForm<T>(open: boolean, sessionKey: string, init: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(init);
  const [session, setSession] = useState<string | null>(open ? sessionKey : null);
  const current = open ? sessionKey : null;
  if (current !== session) {
    setSession(current);
    if (current !== null) setState(init());
  }
  return [state, setState];
}

/** VALIDATION / CONFLICT answers are shown next to the fields instead of a toast. */
export function isFieldLevelError(err: unknown): boolean {
  return isApiClientError(err) && (err.code === "VALIDATION" || err.code === "CONFLICT");
}

/**
 * Field errors of a failed mutation: VALIDATION details by field, CONFLICT on `conflictField` (e.g. duplicate Mã HS).
 * Falls back to a toast when nothing maps to a field of the form.
 */
export function mapServerError<K extends string>(err: unknown, fields: readonly K[], conflictField?: K): FormErrors<K> {
  const mapped: FormErrors<K> =
    isApiClientError(err) && err.code === "CONFLICT" && conflictField
      ? ({ [conflictField]: err.message } as FormErrors<K>)
      : knownFieldErrors(fieldErrors(err), fields);
  if (Object.keys(mapped).length === 0) toast.error(errorMessage(err));
  return mapped;
}

/** Focus the first invalid control of a form whose control ids follow `${formId}-${field}`. */
export function focusFirstError(formId: string, errors: Record<string, string | undefined>): void {
  const first = Object.keys(errors).find((k) => errors[k]);
  if (!first) return;
  requestAnimationFrame(() => document.getElementById(`${formId}-${first}`)?.focus());
}
