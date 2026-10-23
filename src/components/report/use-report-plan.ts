"use client";
/**
 * "Công tác phối hợp tuần/tháng mới" of the report page: GET /api/report-plans for the level + report period (plans are
 * not part of LevelDataset and bump no dataset version), the editor draft of `report.plan` users and the save (PUT with
 * `baseRev`; 409 → `conflict` until the user reloads). Loads again on level / period change and when the tab becomes
 * visible again – a background reload never replaces unsaved edits.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, useLatest } from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { fmtNumber } from "@/lib/client/format";
import { reportPlanId } from "@/lib/firestore-paths";
import type { LevelId, Period, ReportPlan } from "@/lib/types";
import {
  draftFromPlan,
  keepShownPlan,
  nextPeriodLabel,
  planContentOf,
  planDraftIssues,
  planPeriodOf,
  planPutInput,
  samePlanDraft,
  savedPlanContent,
  type PlanDraft,
  type PlanDraftIssues,
  type ReportPlanContent,
  type ReportPlanPeriod,
} from "./lib/report-plan";

export interface ReportPlanState {
  /** Plan period of the report; undefined without a week / month period (nothing to load). */
  period?: ReportPlanPeriod;
  status: "idle" | "loading" | "ready" | "error";
  /** Load error (status "error"). */
  error?: string;
  /** Stored plan; null when nothing was saved for the period yet. */
  saved: ReportPlan | null;
  draft: PlanDraft;
  /** Edits the draft of the loaded period (ignored while loading). */
  setDraft: (update: (draft: PlanDraft) => PlanDraft) => void;
  dirty: boolean;
  issues: PlanDraftIssues;
  saving: boolean;
  /** An explicit reload is running. */
  reloading: boolean;
  /** Message of a refused save (409: someone saved in between) until the next reload. */
  conflict?: string;
  save: () => Promise<void>;
  /** Back to the saved version ("Hoàn tác"). */
  undo: () => void;
  /** Drops the draft and loads the newest stored plan. */
  reload: () => Promise<void>;
  /** What section 5 of the document prints: the draft for an editor (WYSIWYG), the saved plan for everyone else. */
  printed: ReportPlanContent | "loading" | "error";
}

interface Loaded {
  /** reportPlanId of the period this state belongs to. */
  id: string;
  status: "ready" | "error";
  saved: ReportPlan | null;
  draft: PlanDraft;
  error?: string;
  conflict?: string;
}

const EMPTY_DRAFT: PlanDraft = { rows: [], note: "" };
const NO_ISSUES: PlanDraftIssues = { blankKeys: [] };
const FOCUS_RELOAD_MIN_MS = 30_000;

export function useReportPlan(levelId: LevelId, reportPeriod: Period | undefined, canEdit: boolean): ReportPlanState {
  const asked = planPeriodOf(reportPeriod);
  const mode = asked?.mode;
  const key = asked?.key;
  const period = useMemo<ReportPlanPeriod | undefined>(() => (mode && key ? { mode, key } : undefined), [mode, key]);
  const id = period ? reportPlanId(levelId, period.mode, period.key) : undefined;

  const [state, setState] = useState<Loaded>();
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const latest = useLatest(state);
  const seq = useRef(0);
  const lastLoad = useRef(0);

  /** "replace": take the stored plan (drops the draft); "refresh": background check, keeps unsaved edits and newer plans. */
  const load = useCallback(
    async (how: "replace" | "refresh") => {
      if (!mode || !key) return;
      const planId = reportPlanId(levelId, mode, key);
      const req = ++seq.current;
      lastLoad.current = Date.now();
      try {
        const { plan } = await api.reportPlans.get(levelId, mode, key);
        if (req !== seq.current) return;
        setState((s) =>
          how === "refresh" && s?.id === planId && s.status === "ready" && keepShownPlan(s, plan)
            ? s
            : { id: planId, status: "ready", saved: plan, draft: draftFromPlan(plan) },
        );
      } catch (err) {
        if (req !== seq.current) return;
        const message = errorMessage(err);
        const shown = latest.current;
        if (shown?.id === planId && shown.status === "ready") {
          // Keep what is on screen; only an explicit reload reports the failure.
          if (how === "replace") toast.error("Chưa tải lại được công tác phối hợp", { description: message });
          return;
        }
        setState({ id: planId, status: "error", saved: null, draft: EMPTY_DRAFT, error: message });
      }
    },
    [levelId, mode, key, latest],
  );

  useEffect(() => {
    void load("replace");
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > FOCUS_RELOAD_MIN_MS) void load("refresh");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const current = state && state.id === id ? state : undefined;
  const saved = current?.saved ?? null;
  const draft = current?.status === "ready" ? current.draft : EMPTY_DRAFT;
  const base = useMemo(() => draftFromPlan(saved), [saved]);
  const dirty = canEdit && current?.status === "ready" && !samePlanDraft(draft, base);
  const issues = useMemo(() => (current?.status === "ready" ? planDraftIssues(draft) : NO_ISSUES), [current?.status, draft]);
  const status: ReportPlanState["status"] = !period ? "idle" : current ? current.status : "loading";

  const setDraft = useCallback(
    (update: (d: PlanDraft) => PlanDraft) => setState((s) => (s && s.id === id && s.status === "ready" ? { ...s, draft: update(s.draft) } : s)),
    [id],
  );

  const reload = useCallback(async () => {
    setReloading(true);
    try {
      await load("replace");
    } finally {
      setReloading(false);
    }
  }, [load]);

  const undo = useCallback(() => {
    const shown = latest.current;
    if (!shown || shown.id !== id || shown.status !== "ready") return;
    const previous = shown.draft;
    setState((s) => (s && s.id === id && s.status === "ready" ? { ...s, draft: draftFromPlan(s.saved) } : s));
    toast("Đã hoàn tác thay đổi", { action: { label: "Làm lại", onClick: () => setDraft(() => previous) } });
  }, [id, latest, setDraft]);

  async function save() {
    if (!canEdit || !period || !current || current.status !== "ready" || saving || !dirty || issues.message) return;
    const planId = current.id;
    const input = planPutInput(levelId, period, current.draft, current.saved?.rev ?? 0);
    setSaving(true);
    try {
      const plan = await api.reportPlans.put(input);
      setState((s) => (s?.id === planId ? { ...s, saved: plan, conflict: undefined } : s));
      const what = plan.items.length > 0 ? `${fmtNumber(plan.items.length)} công việc` : "mục để trống";
      toast.success("Đã lưu công tác phối hợp", { description: `${nextPeriodLabel(period)} · ${what}` });
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        setState((s) => (s?.id === planId ? { ...s, conflict: err.message } : s));
        return;
      }
      toast.error("Chưa lưu được công tác phối hợp", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const printed = useMemo<ReportPlanState["printed"]>(() => {
    if (!current) return period ? "loading" : { items: [] };
    if (current.status === "error") return "error";
    return canEdit ? planContentOf(current.draft) : savedPlanContent(current.saved);
  }, [current, period, canEdit]);

  return {
    period,
    status,
    error: current?.error,
    saved,
    draft,
    setDraft,
    dirty,
    issues,
    saving,
    reloading,
    conflict: current?.conflict,
    save,
    undo,
    reload,
    printed,
  };
}
