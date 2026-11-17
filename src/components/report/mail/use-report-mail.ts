"use client";
/**
 * State of the "Gửi email" dialog of Báo cáo tuần/tháng:
 * - GET /api/reports/mail/recipients each time the dialog opens (Cài đặt → Email may have changed; the last answer stays
 *   on screen while it reloads);
 * - the draft (targets, addresses, options, note) – kept while the dialog is closed and reopened for the same level,
 *   period, toolbar recipient and detail state; a successful send starts a fresh one;
 * - POST /api/reports/mail, then the progress of the batch, "Gửi lại" (POST /api/mail/jobs/:id/retry). The last batch
 *   of each level lives in the batch store (use-batch-watches.ts), which polls GET /api/mail/batches/:id every 3 s until
 *   done and toasts the result – also while the dialog is closed, the report screen unmounted (level switch, another
 *   page) or the screen shows another level. The dialog shows only its level's batch. Reopening the dialog drops a
 *   batch that sent every email; one with failed / skipped emails stays (its toast says where to reopen the dialog)
 *   until "Gửi thư khác".
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast, useLatest } from "@/components/ui";
import { errorMessage, isApiClientError } from "@/lib/client/api";
import type { ReportMailRecipientsResponse } from "@/lib/contract";
import type { ClassInfo, LevelId } from "@/lib/types";
import type { RecipientOption } from "../lib/report-model";
import type { ReportPlanPeriod } from "../lib/report-plan";
import { reportMailApi } from "./mail-api";
import { useBatchWatches } from "./use-batch-watches";
import { resumeWatch, retryInWatch, startWatch, watchOnReopen, type BatchWatch } from "./lib/mail-batch";
import {
  initialMailDraft,
  mailDraftIssues,
  mailSummary,
  mailTargetRows,
  reportMailInput,
  sendBlockReason,
  withNewRows,
  type MailDraft,
  type MailDraftIssues,
  type MailSummary,
  type MailTargetRow,
} from "./lib/mail-draft";

export interface ReportMailArgs {
  open: boolean;
  levelId: LevelId;
  period: ReportPlanPeriod;
  /** "Tuần 19/10 – 25/10/2026" (toast of the finished batch). */
  periodLabel: string;
  /** Recipient options of the toolbar (what the sender may address). */
  options: readonly RecipientOption[];
  /** Classes of the dataset (grade / teacher of a class the recipient list does not know). */
  classes: readonly ClassInfo[];
  /** Toolbar recipient: checked by default. */
  selectedKey: string;
  /** Toolbar "Kèm bảng chi tiết": default of "Kèm bảng chi tiết sự việc". */
  detail: boolean;
  /** The sender's email (summary of "Gửi bản sao cho tôi"). */
  selfEmail?: string;
  /** Unsaved "Công tác phối hợp" (the email and its PDF use the saved plan): sending is blocked. */
  planDirty: boolean;
}

export interface ReportMailRecipientsState {
  status: "loading" | "error" | "ready";
  data?: ReportMailRecipientsResponse;
  error?: string;
  /** "Thử lại" after a load error. */
  reload: () => Promise<void>;
  reloading: boolean;
}

export interface ReportMailState {
  recipients: ReportMailRecipientsState;
  rows: MailTargetRow[];
  /** Identity of the draft (level, period, toolbar recipient, detail): remount the form when it changes. */
  draftKey: string;
  draft: MailDraft;
  update: (fn: (draft: MailDraft) => MailDraft) => void;
  issues: MailDraftIssues;
  summary: MailSummary;
  /** Why "Gửi" is disabled (Vietnamese); undefined when it can be clicked. */
  blockReason?: string;
  sending: boolean;
  /** Why the last send was refused (until the next edit / send). */
  sendError?: string;
  send: () => Promise<void>;
  /** Progress of the last send for this level (undefined: compose). */
  watch?: BatchWatch;
  /** Jobs whose "Gửi lại" is running. */
  retrying: ReadonlySet<string>;
  retry: (jobId: string) => Promise<void>;
  /** Poll the batch again now (after polling stopped). */
  refreshBatch: () => void;
  /** Leave the progress view for a new draft. */
  newMessage: () => void;
}

interface LoadedRecipients {
  levelId: LevelId;
  status: "ready" | "error";
  data?: ReportMailRecipientsResponse;
  error?: string;
}

export function useReportMail(args: ReportMailArgs): ReportMailState {
  const { open, levelId, period, periodLabel, options, classes, selectedKey, detail, selfEmail, planDirty } = args;

  /* ------------------------------ recipients ------------------------------ */
  const [loaded, setLoaded] = useState<LoadedRecipients>();
  const [reloading, setReloading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const req = ++seq.current;
    try {
      const data = await reportMailApi.recipients(levelId);
      if (req === seq.current) setLoaded({ levelId, status: "ready", data });
    } catch (err) {
      if (req !== seq.current) return;
      const error = errorMessage(err);
      // A background reload keeps the list on screen; only a first load shows the error.
      setLoaded((prev) => (prev?.levelId === levelId && prev.status === "ready" ? prev : { levelId, status: "error", error }));
    }
  }, [levelId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const reload = useCallback(async () => {
    setReloading(true);
    try {
      await load();
    } finally {
      setReloading(false);
    }
  }, [load]);

  const current = loaded?.levelId === levelId ? loaded : undefined;
  const data = current?.data;
  const rows = useMemo(() => (data ? mailTargetRows(data, options, classes) : []), [data, options, classes]);

  /* --------------------------------- draft -------------------------------- */
  const draftKey = `${levelId}|${period.mode}|${period.key}|${selectedKey}|${detail ? 1 : 0}`;
  const initial = useMemo(() => initialMailDraft(rows, selectedKey, detail), [rows, selectedKey, detail]);
  const [stored, setStored] = useState<{ key: string; draft: MailDraft }>();
  const draft = useMemo(() => (stored?.key === draftKey ? withNewRows(stored.draft, initial) : initial), [stored, draftKey, initial]);
  const base = useLatest({ draftKey, initial });
  // Bound to the draft it belongs to: another level / period / recipient never shows this error.
  const [sendError, setSendError] = useState<{ key: string; message: string }>();

  const update = useCallback(
    (fn: (d: MailDraft) => MailDraft) => {
      const { draftKey: key, initial: start } = base.current;
      setStored((s) => ({ key, draft: fn(s?.key === key ? withNewRows(s.draft, start) : start) }));
      setSendError(undefined);
    },
    [base],
  );

  const summary = useMemo(() => mailSummary(draft, rows, data?.cc ?? [], selfEmail), [draft, rows, data?.cc, selfEmail]);
  // The server adds the same CC (settings ∪ the sender) to every email and counts it in the per-email limit.
  const issues = useMemo(() => mailDraftIssues(draft, rows, summary.cc), [draft, rows, summary.cc]);
  const recipientsStatus = current?.status ?? "loading";
  const blockReason = sendBlockReason({
    recipients: recipientsStatus,
    configured: data?.status.configured ?? false,
    domainsKnown: (data?.status.allowedDomains.length ?? 0) > 0,
    planDirty,
    issues,
  });

  /* --------------------------------- send --------------------------------- */
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const { watches, update: updateWatch } = useBatchWatches();
  const watch = watches[levelId];

  async function send() {
    // `busy`: a double click must not queue the batch twice (state updates only after the next render).
    if (busy.current || blockReason) return;
    const input = reportMailInput(levelId, period, draft, rows);
    busy.current = true;
    setSending(true);
    setSendError(undefined);
    try {
      const res = await reportMailApi.send(input);
      setStored(undefined);
      const withoutPdf = !!data?.status.pdfWarning;
      updateWatch(levelId, () => startWatch(res, levelId, periodLabel, Date.now(), { withoutPdf }));
    } catch (err) {
      const message = errorMessage(err);
      setSendError({ key: draftKey, message }); // draftKey of the render whose "Gửi" was clicked
      toast.error("Chưa gửi được báo cáo", { description: message });
      // 409: the sending configuration changed (e.g. removed) – show the current status.
      if (isApiClientError(err) && err.status === 409) void load();
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  /* ------------------------------- progress ------------------------------- */
  // Reopening after a batch that sent everything starts a new message; an unfinished one, or a finished one with
  // failed / skipped emails ("Gửi lại"), keeps showing its progress until "Gửi thư khác". A layout effect: the store
  // update re-renders before the opened sheet is painted, so the finished batch never flashes.
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const opened = open && !wasOpen.current;
    wasOpen.current = open;
    if (opened) updateWatch(levelId, watchOnReopen);
  }, [open, levelId, updateWatch]);

  const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());
  const retryingRef = useLatest(retrying);
  const watchRef = useLatest(watch);

  const retry = useCallback(
    async (jobId: string) => {
      if (retryingRef.current.has(jobId)) return;
      const batchId = watchRef.current?.batchId;
      setRetrying((s) => new Set(s).add(jobId));
      try {
        await reportMailApi.retry(jobId);
        // Only the batch the job was shown in ("Gửi thư khác" may have dropped it meanwhile).
        updateWatch(levelId, (w) => (w && w.batchId === batchId ? retryInWatch(w, jobId, Date.now()) : w));
      } catch (err) {
        toast.error("Chưa gửi lại được thư", { description: errorMessage(err) });
      } finally {
        setRetrying((s) => {
          const next = new Set(s);
          next.delete(jobId);
          return next;
        });
      }
    },
    [retryingRef, watchRef, levelId, updateWatch],
  );

  const refreshBatch = useCallback(() => updateWatch(levelId, (w) => (w ? resumeWatch(w, Date.now()) : w)), [levelId, updateWatch]);
  const newMessage = useCallback(() => updateWatch(levelId, () => undefined), [levelId, updateWatch]);

  return {
    recipients: { status: recipientsStatus, data, error: current?.error, reload, reloading },
    rows,
    draftKey,
    draft,
    update,
    issues,
    summary,
    blockReason,
    sending,
    sendError: sendError?.key === draftKey ? sendError.message : undefined,
    send,
    watch,
    retrying,
    retry,
    refreshBatch,
    newMessage,
  };
}
