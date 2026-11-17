"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { History, RefreshCw } from "lucide-react";
import { Button, ErrorState, SkeletonCard, toast } from "@/components/ui";
import { errorMessage, isApiClientError, validationIssues } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import type { MailSettingsResponse } from "@/lib/contract";
import { LEVELS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";
import { Notice, ServerErrors } from "../shared/notice";
import { SaveBar } from "../shared/save-bar";
import { focusFirstInvalid, useReportDirty, useSettingsNav } from "../shared/settings-context";
import { useDraft } from "../shared/use-draft";
import { ConnectionCard } from "./connection-card";
import { DomainsCard } from "./domains-card";
import {
  changedMailParts,
  draftAllowedDomains,
  mailDraft,
  mailPayload,
  mailServerErrors,
  senderDomain,
  validateMailDraft,
  withMailList,
  type MailDraft,
  type MailErrors,
} from "./lib/mail-form";
import { mailApi } from "./mail-api";
import { MailLogCard } from "./mail-log-card";
import { NoticesCard, type CoverageState } from "./notices-card";
import { RecipientsCard } from "./recipients-card";

const NO_SERVER_ERRORS = { fields: {} as MailErrors, general: [] as string[] };
const NO_ERRORS: MailErrors = {};
/** Coming back to the browser tab re-checks the settings at most this often (someone else may have saved). */
const FOCUS_RELOAD_MIN_MS = 30_000;

type LoadResult = { ok: true } | { ok: false; message: string };

/**
 * Tab "Email" of Cài đặt (settings.manage, per level): GET/PUT /api/settings/:level/mail (not part of LevelDataset),
 * test message, GVCN coverage (GET /api/reports/mail/recipients) and the mail log. Saves send `baseRev` = the rev the
 * draft started from; 409 → "Tải bản mới nhất".
 */
export function MailTab({ levelId }: { levelId: LevelId }) {
  const { can, profile } = useSession();
  const { goToTab } = useSettingsNav();
  const [data, setData] = useState<MailSettingsResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const lastLoad = useRef(0);

  const load = useCallback(async (): Promise<LoadResult> => {
    const req = ++seq.current;
    lastLoad.current = Date.now();
    setLoading(true);
    try {
      const res = await mailApi.settings(levelId);
      if (req !== seq.current) return { ok: false, message: "" };
      setData(res);
      setLoadError(undefined);
      return { ok: true };
    } catch (err) {
      const message = errorMessage(err);
      if (req === seq.current) setLoadError(message);
      return { ok: false, message };
    } finally {
      if (req === seq.current) setLoading(false);
    }
  }, [levelId]);

  const canCoverage = can("report.send");
  const [coverage, setCoverage] = useState<CoverageState>(canCoverage ? { status: "loading" } : { status: "hidden" });
  const coverageSeq = useRef(0);
  const loadCoverage = useCallback(async () => {
    if (!canCoverage) return;
    const req = ++coverageSeq.current;
    setCoverage((c) => (c.status === "ready" ? c : { status: "loading" }));
    try {
      const res = await mailApi.recipients(levelId);
      if (req === coverageSeq.current) setCoverage({ status: "ready", classes: res.classes, domainsKnown: res.status.allowedDomains.length > 0 });
    } catch (err) {
      if (req === coverageSeq.current) setCoverage({ status: "error", message: errorMessage(err) });
    }
  }, [levelId, canCoverage]);

  useEffect(() => {
    void load();
    void loadCoverage();
  }, [load, loadCoverage]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastLoad.current < FOCUS_RELOAD_MIN_MS) return;
      void load(); // a background check never replaces unsaved edits (useDraft marks them stale instead)
      void loadCoverage();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, loadCoverage]);

  const source = useMemo(() => (data ? mailDraft(data.settings, levelId) : null), [data, levelId]);
  const { draft, setDraft, base, dirty, stale, reset, reload, markSaved } = useDraft<MailDraft | null>(source);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [conflict, setConflict] = useState<string>();
  const [serverErrors, setServerErrors] = useState(NO_SERVER_ERRORS);
  const [logSignal, setLogSignal] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useReportDirty("email", dirty);

  const clientErrors = useMemo(() => (draft ? validateMailDraft(draft, levelId) : NO_ERRORS), [draft, levelId]);
  const errors: MailErrors = { ...serverErrors.fields, ...clientErrors };
  const errorCount = Object.keys(clientErrors).length;
  const changed = draft && base ? changedMailParts(draft, base, levelId) : [];
  const status = data?.status;
  const effective = useMemo(() => (draft && status ? draftAllowedDomains(draft, status) : []), [draft, status]);

  const patch = useCallback(
    (update: (d: MailDraft) => MailDraft) => {
      setDraft((d) => (d ? update(d) : d));
      setServerErrors(NO_SERVER_ERRORS);
    },
    [setDraft],
  );

  async function save() {
    if (!draft || saving) return;
    if (conflict || stale) {
      toast.error("Chưa lưu được", { description: "Cài đặt email vừa được người khác lưu – hãy tải bản mới nhất trước." });
      return;
    }
    if (errorCount > 0) {
      focusFirstInvalid(rootRef.current);
      toast.error("Chưa lưu được", { description: "Vui lòng sửa các ô được đánh dấu đỏ." });
      return;
    }
    if (changed.length === 0) {
      markSaved();
      return;
    }
    setSaving(true);
    try {
      const res = await mailApi.putSettings(levelId, mailPayload(draft));
      markSaved();
      setData(res); // the draft follows the stored (normalised) version and its new rev
      toast.success("Đã lưu cài đặt email", { description: `${LEVELS[levelId].name}: ${changed.join(", ")}.` });
      void loadCoverage();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        setConflict(err.message);
        return;
      }
      setServerErrors(mailServerErrors(validationIssues(err)));
      toast.error("Chưa lưu được cài đặt email", { description: errorMessage(err) });
      window.setTimeout(() => focusFirstInvalid(rootRef.current), 0);
    } finally {
      setSaving(false);
    }
  }

  /** After a 409 / a newer version seen in the background: drop the edits and take the stored settings. */
  async function loadLatest() {
    setReloading(true);
    try {
      const res = await load();
      if (!res.ok) {
        if (res.message) toast.error("Chưa tải lại được cài đặt email", { description: res.message });
        return;
      }
      reload();
      setConflict(undefined);
      setServerErrors(NO_SERVER_ERRORS);
      toast.success("Đã tải cài đặt email mới nhất");
    } finally {
      setReloading(false);
    }
  }

  function undo() {
    const previous = draft;
    reset();
    setServerErrors(NO_SERVER_ERRORS);
    toast("Đã hoàn tác thay đổi", { action: { label: "Làm lại", onClick: () => setDraft(previous) } });
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await mailApi.sendTest(levelId);
      if (res.ok) toast.success("Đã gửi thư thử", { description: `Tới ${profile?.email ?? "email của bạn"} – kiểm tra hộp thư đến (và cả thư rác).` });
      else toast.error("Chưa gửi được thư thử", { description: res.error ?? "Máy chủ chưa gửi được thư. Xem Nhật ký gửi thư để biết lý do." });
    } catch (err) {
      toast.error("Chưa gửi được thư thử", { description: errorMessage(err) });
    } finally {
      setTesting(false);
      setLogSignal((n) => n + 1);
    }
  }

  const disabled = saving || reloading;
  const settings = data?.settings;
  const updated = settings?.updatedAt ? fmtDateTime(settings.updatedAt) : "";

  let body: ReactNode;
  if (draft && status) {
    body = (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
        <ConnectionCard status={status} userEmail={profile?.email} testing={testing} onTest={() => void sendTest()} className="xl:col-span-5" />
        <NoticesCard
          notices={draft.notices}
          onChange={(notices) => patch((d) => ({ ...d, notices }))}
          configured={status.configured}
          coverage={coverage}
          onRetryCoverage={() => void loadCoverage()}
          onOpenClasses={() => goToTab("lop")}
          disabled={disabled}
          className="xl:col-span-7"
        />
        <RecipientsCard
          levelId={levelId}
          draft={draft}
          errors={errors}
          domains={effective}
          onListChange={(id, list) => patch((d) => withMailList(d, id, list))}
          onOpenClasses={() => goToTab("lop")}
          disabled={disabled}
          className="md:col-span-2 xl:col-span-8"
        />
        <DomainsCard
          domains={draft.allowedDomains}
          onChange={(allowedDomains) => patch((d) => ({ ...d, allowedDomains }))}
          effective={effective}
          senderDomain={senderDomain(status)}
          error={errors.allowedDomains}
          disabled={disabled}
          className="md:col-span-2 xl:col-span-4 xl:self-start"
        />
      </div>
    );
  } else if (loadError) {
    body = <ErrorState title="Chưa tải được cài đặt email" message={loadError} onRetry={() => void load()} retrying={loading} className="card" />;
  } else {
    body = <SkeletonCard rows={6} label="Đang tải cài đặt email…" />;
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {conflict || stale ? (
        <Notice
          tone="warn"
          live={!!conflict}
          title="Cài đặt email vừa được cập nhật trên máy chủ"
          action={
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void loadLatest()} loading={reloading}>
              Tải bản mới nhất
            </Button>
          }
        >
          {conflict ?? "Một quản trị viên khác vừa lưu cài đặt email của cấp này."} Tải bản mới nhất để tiếp tục – thay đổi chưa lưu ở tab này sẽ được
          thay bằng bản trên máy chủ.
        </Notice>
      ) : null}
      <ServerErrors messages={serverErrors.general} />
      {body}
      {updated ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <History aria-hidden className="size-3.5" />
          Cập nhật lần cuối {updated}
          {settings?.updatedBy ? ` bởi ${settings.updatedBy}` : ""}
        </p>
      ) : null}
      <MailLogCard levelId={levelId} reloadSignal={logSignal} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        errorCount={errorCount}
        summary={changed.length > 0 ? `Đã sửa: ${changed.join(", ")}` : undefined}
        onSave={() => void save()}
        onReset={undo}
      />
    </div>
  );
}
