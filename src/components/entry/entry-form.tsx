"use client";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ClipboardPen, Clock, Pencil, Undo2 } from "lucide-react";
import { ErrorPicker, PhotoCapture, formatRemaining, photoSaveBlocker, useNow, type PhotoUploadSummary } from "@/components/app/widgets";
import { Button, Card, DateInput, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { api, errorMessage, isApiClientError, newClientRequestId } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDateTime, fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import { INCIDENT_STATUSES } from "@/lib/constants";
import { calendarStart } from "@/lib/engine";
import type { Incident, IncidentStatus, LevelDataset } from "@/lib/types";
import { EntryActionBar, type SaveMode } from "./action-bar";
import { ClassField } from "./class-field";
import { ErrorMeta } from "./error-meta";
import { EvidenceLinks } from "./evidence-links";
import { FormStep } from "./form-step";
import { entryEditAccess } from "./lib/edit-access";
import {
  entryDateHint,
  entryDraftKey,
  entryDrafts,
  entryFormDirty,
  freshEntryForm,
  formFromIncident,
  newEntryForm,
  nextEntryForm,
  withClass,
  withErrorCode,
  withScope,
  type EntryForm as EntryFormState,
} from "./lib/form-model";
import { payloadKey, requestFor, toIncidentCreateInput, toIncidentUpdateInput, type PendingRequest } from "./lib/payload";
import { computeEntryPreview, entryCalendarProblem, resolveCatalogItem } from "./lib/preview";
import { PointsPreview } from "./points-preview";
import { ScopeField, StudentsField } from "./scope-students";
import { sameParam } from "./lib/leave-guard";
import { useLeaveGuard } from "./use-leave-guard";

const STATUS_OPTIONS = INCIDENT_STATUSES.map((s) => ({ value: s, label: s }));
/** `?edit=` decides which form "/nhap-lieu" shows; other query changes keep it. */
const KEEPS_ENTRY_FORM = sameParam("edit");

export interface EntryFormProps {
  ds: LevelDataset;
  today: string;
  /** Edit mode: the record to update (access already checked by the caller). */
  editing?: Incident;
  recentClasses: readonly string[];
  onClassUsed: (classCode: string) => void;
  onOpenDetail: (incident: Incident) => void;
  onCancelEdit: () => void;
  onEditSaved: () => void;
  /** Edit refused with 409 (changed by someone else meanwhile / deleted): reload the record. */
  onEditConflict?: () => void;
}

/**
 * The incident form (SCR-07): 7 numbered steps in one card + a sticky action bar.
 * Unsaved input is protected: leaving asks first, and a form dropped without a prompt (level switch, browser back)
 * is kept in this tab's memory and restored the next time the same form opens.
 */
export function EntryForm({ ds, today, editing, recentClasses, onClassUsed, onOpenDetail, onCancelEdit, onEditSaved, onEditConflict }: EntryFormProps) {
  const { profile } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const draftKey = entryDraftKey(profile?.uid, ds.levelId, editing);
  const [start] = useState(() => {
    const base = editing ? formFromIncident(editing) : newEntryForm({ today, reporter: profile?.displayName });
    const kept = draftKey ? entryDrafts.read(draftKey) : undefined;
    return { base, form: kept ?? base, restored: !!kept };
  });
  /** What the form started from (blank form, the form after the last save, or the record) – "dirty" compares to it. */
  const [baseline, setBaseline] = useState<EntryFormState>(start.base);
  const [form, setForm] = useState<EntryFormState>(start.form);
  const [saving, setSaving] = useState<SaveMode | null>(null);
  const [photoUploads, setPhotoUploads] = useState<PhotoUploadSummary>({ inProgress: 0, failed: 0 });
  const uploading = photoUploads.inProgress > 0;
  /** Photos still uploading or failed (a failed photo would silently be missing from the record). */
  const photoBlocker = photoSaveBlocker(photoUploads);
  const [attempted, setAttempted] = useState(false);
  const [round, setRound] = useState(0); // remounts pickers with inner state (search text, photo previews) after a reset
  const [focusTick, setFocusTick] = useState(0);
  const pending = useRef<PendingRequest | null>(null);
  const inFlight = useRef(false); // blocks a double tap before the disabled state renders
  const errorId = useId();
  const previewId = useId();

  const preview = useMemo(() => computeEntryPreview(ds, form, today, editing), [ds, form, today, editing]);
  const set = (patch: Partial<EntryFormState>) => setForm((f) => ({ ...f, ...patch }));
  const formDirty = useMemo(() => entryFormDirty(form, baseline), [form, baseline]);

  // Keep a copy of unsaved input for this tab; forget it once the form is back to its baseline.
  useEffect(() => {
    if (!draftKey) return;
    if (formDirty) entryDrafts.write(draftKey, form);
    else entryDrafts.clear(draftKey);
  }, [draftKey, form, formDirty]);

  const discardDraft = () => {
    if (draftKey) entryDrafts.clear(draftKey);
  };
  const restartFromBaseline = () => {
    discardDraft();
    setForm(baseline);
    setAttempted(false);
    setRound((r) => r + 1);
  };
  const restartRef = useRef(restartFromBaseline);
  useEffect(() => {
    restartRef.current = restartFromBaseline;
  });
  const announced = useRef(false);
  useEffect(() => {
    if (!start.restored || announced.current) return;
    announced.current = true;
    toast.info(editing ? `Đã khôi phục thay đổi chưa lưu của ${editing.code}` : "Đã khôi phục sự việc đang nhập dở", {
      description: "Thông tin thầy/cô nhập trước đó chưa được lưu và đã được giữ lại.",
      action: { label: editing ? "Bỏ thay đổi" : "Nhập mới", onClick: () => restartRef.current() },
    });
  }, [start.restored, editing]);

  const leaveGuard = useLeaveGuard({
    when: formDirty || uploading || photoUploads.failed > 0,
    title: editing ? "Bỏ thay đổi chưa lưu?" : "Bỏ sự việc đang nhập?",
    message: editing
      ? `Các thay đổi của sự việc ${editing.code} chưa được cập nhật và sẽ bị bỏ nếu rời trang này.`
      : "Thông tin thầy/cô vừa nhập (lớp, lỗi, học sinh, mô tả, minh chứng) chưa được lưu và sẽ bị bỏ nếu rời trang này.",
    onDiscard: discardDraft,
    samePage: KEEPS_ENTRY_FORM,
  });

  useEffect(() => {
    if (focusTick === 0) return;
    const el = document.getElementById(errorId);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusTick, errorId]);

  useEffect(() => {
    if (editing) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [editing]);

  async function submit(mode: SaveMode) {
    if (inFlight.current || saving || uploading) return;
    if (photoBlocker) {
      toast.error(`Chưa thể lưu: ${photoBlocker}`);
      return;
    }
    if (!preview.canSave || !preview.unit) {
      setAttempted(true);
      document.getElementById(previewId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    inFlight.current = true;
    setSaving(mode);
    try {
      if (editing) {
        const updated = await api.incidents.update(editing.id, toIncidentUpdateInput(form, preview.unit, editing));
        toast.success(`Đã cập nhật ${updated.code} · ${fmtNumber(updated.points)} điểm trừ`, {
          action: { label: "Xem", onClick: () => onOpenDetail(updated) },
        });
        discardDraft();
        setBaseline(form); // saved: leaving no longer loses anything
        inFlight.current = false;
        setSaving(null);
        await refresh();
        onEditSaved();
        return;
      }
      const payload = toIncidentCreateInput(ds.levelId, form, preview.unit);
      // Same payload retried after a failure → same idempotency key, so a lost response never creates a duplicate.
      const request = requestFor(pending.current, payloadKey(payload), newClientRequestId);
      pending.current = request;
      const created = await api.incidents.create({ ...payload, clientRequestId: request.id });
      pending.current = null;
      onClassUsed(created.classCode);
      toast.success(`Đã ghi nhận ${created.code} · ${fmtNumber(created.points)} điểm trừ`, {
        description: `Lớp ${created.classCode} · ${created.issue}`,
        action: { label: "Xem", onClick: () => onOpenDetail(created) },
      });
      // The fieldset is disabled while saving, so `form` is still what was sent.
      const next = mode === "next" ? nextEntryForm(form) : freshEntryForm(form, today);
      setForm(next);
      setBaseline(next);
      setAttempted(false);
      setRound((r) => r + 1);
      inFlight.current = false;
      setSaving(null);
      if (mode === "next") setFocusTick((t) => t + 1);
      else window.scrollTo({ top: 0, behavior: "smooth" });
      await refresh();
    } catch (err) {
      if (editing && isApiClientError(err) && err.status === 409) {
        // Someone changed (or deleted) the record since it was opened: never overwrite it – reload the latest version.
        toast.error(err.message, { description: "Đã tải lại bản mới nhất của sự việc – vui lòng kiểm tra rồi sửa lại." });
        discardDraft();
        onEditConflict?.();
        return;
      }
      toast.error(errorMessage(err, editing ? "Chưa cập nhật được sự việc. Vui lòng thử lại." : "Chưa lưu được sự việc. Vui lòng thử lại."));
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit(editing ? "update" : "save");
    }
  }

  const dateHint = entryDateHint(form.date, today, entryCalendarProblem(ds.weeks, form.date, editing));
  const cancelEdit = () => {
    discardDraft();
    onCancelEdit();
  };

  return (
    <>
      <form
        noValidate
        aria-label={editing ? `Sửa sự việc ${editing.code}` : "Ghi nhận sự việc"}
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        className="min-w-0"
      >
        <Card
          padding="none"
          headingLevel={2}
          icon={editing ? Pencil : ClipboardPen}
          title={editing ? `Sửa sự việc ${editing.code}` : "Ghi nhận sự việc"}
          subtitle={editing ? "Điểm trừ được tính lại theo quy định khi cập nhật." : "Mục có dấu * là bắt buộc · điểm trừ được tính tự động."}
          actions={
            editing ? (
              <Button variant="ghost" size="sm" icon={Undo2} onClick={cancelEdit} disabled={saving !== null}>
                Hủy sửa
              </Button>
            ) : null
          }
        >
          {editing ? <EditInfo incident={editing} /> : null}
          <fieldset disabled={saving !== null} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Thông tin sự việc</legend>
            <FormStep n={1} title="Ngày & lớp" done={!!form.date && !!form.classCode}>
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                <Field label="Ngày" required hint={dateHint.hint} error={dateHint.error}>
                  <DateInput value={form.date} onChange={(v) => set({ date: v })} min={calendarStart(ds.weeks)} max={today} size="lg" />
                </Field>
                <Field label="Lớp" required>
                  <ClassField ds={ds} value={form.classCode} onChange={(c) => setForm((f) => withClass(f, c))} recent={recentClasses} />
                </Field>
              </div>
            </FormStep>

            <FormStep n={2} title="Lỗi vi phạm" done={!!preview.item}>
              <Field label="Lỗi vi phạm" required htmlFor={errorId} hint={preview.item ? undefined : "Gõ không dấu để tìm nhanh, ví dụ “muon”, “dong phuc” hoặc mã “L01”."}>
                <ErrorPicker
                  ds={ds}
                  value={form.errorCode || undefined}
                  onChange={(code) => setForm((f) => withErrorCode(f, code, resolveCatalogItem(ds.catalog, code, editing)?.unit))}
                  size="lg"
                />
              </Field>
              {preview.item ? <ErrorMeta item={preview.item} fromSnapshot={!!editing && editing.errorCode === form.errorCode} /> : null}
            </FormStep>

            <FormStep n={3} title="Phạm vi">
              <ScopeField value={form.scope} onChange={(s) => setForm((f) => withScope(f, s))} unit={preview.unit} automatic={!form.scopeTouched} />
            </FormStep>

            <FormStep n={4} title="Học sinh liên quan" description={form.classCode ? `Chỉ hiện học sinh đang học của lớp ${form.classCode}.` : "Chọn lớp ở bước 1 để hiện danh sách học sinh."}>
              <StudentsField
                key={round}
                ds={ds}
                classCode={form.classCode}
                scope={form.scope}
                unit={preview.unit}
                studentIds={form.studentIds}
                onStudentsChange={(ids) => set({ studentIds: ids })}
                unnamedCount={form.unnamedCount}
                onUnnamedChange={(n) => set({ unnamedCount: n })}
                occurrenceCount={form.occurrenceCount}
                onOccurrenceChange={(n) => set({ occurrenceCount: n })}
                allowsUnnamed={preview.allowsUnnamed}
                // Same class as the record: its students stay valid even if they changed class since (server rule).
                keptStudents={editing && form.classCode === editing.classCode ? editing.students : undefined}
              />
            </FormStep>

            <FormStep n={5} id={previewId} title="Điểm trừ" done={preview.canSave}>
              <PointsPreview preview={preview} scope={form.scope} classCode={form.classCode} attempted={attempted} storedPoints={editing?.points} />
            </FormStep>

            <FormStep n={6} title="Chi tiết" description="Không bắt buộc – giúp GVCN và BGH nắm rõ sự việc.">
              <Field label="Mô tả sự việc" labelAside={`${form.detail.length}/2000`}>
                <Textarea
                  value={form.detail}
                  onChange={(e) => set({ detail: e.target.value })}
                  maxLength={2000}
                  rows={3}
                  placeholder="Ví dụ: 7h20 tại cổng trường, đến sau hồi trống; không đeo khăn quàng khi chào cờ; bàn ăn tầng 2 chưa lau…"
                />
              </Field>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Field label="Người ghi" hint={form.reporter.trim() ? undefined : "Để trống: dùng tên tài khoản của thầy/cô."}>
                  <Input value={form.reporter} onChange={(e) => set({ reporter: e.target.value })} maxLength={120} autoComplete="name" enterKeyHint="done" />
                </Field>
                <Field label="Trạng thái">
                  <Select<IncidentStatus> options={STATUS_OPTIONS} value={form.status} onChange={(v) => v && set({ status: v })} />
                </Field>
              </div>
            </FormStep>

            <FormStep n={7} title="Minh chứng" description="Không bắt buộc – chụp ảnh tại chỗ hoặc dán liên kết (tối đa 5 ảnh, 5 liên kết).">
              <PhotoCapture key={`photos-${round}`} className="max-w-xl" levelId={ds.levelId} value={form.photoIds} onChange={(ids) => set({ photoIds: ids })} onUploadsChange={setPhotoUploads} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-[13.5px] font-semibold text-slate-800">Liên kết minh chứng</p>
                <EvidenceLinks key={`links-${round}`} value={form.links} onChange={(links) => set({ links })} />
              </div>
            </FormStep>
          </fieldset>
        </Card>

        <EntryActionBar
          mode={editing ? "edit" : "create"}
          preview={preview}
          saving={saving}
          uploading={uploading}
          photoBlocker={photoBlocker}
          onSave={() => void submit(editing ? "update" : "save")}
          onSaveNext={() => void submit("next")}
          onCancelEdit={cancelEdit}
          previewId={previewId}
        />
      </form>
      {/* Outside the <form>: keys in the dialog must not reach the form's Ctrl+Enter shortcut. */}
      {leaveGuard}
    </>
  );
}

/** Who recorded the incident being edited and how long the editor may still change it. */
function EditInfo({ incident }: { incident: Incident }) {
  const { profile } = useSession();
  const now = useNow();
  const access = entryEditAccess(profile, incident, now);
  return (
    <p className="mx-4 mb-1 flex items-start gap-2 rounded-xl bg-star-50 px-3 py-2.5 text-[13px] leading-5 text-star-900 ring-1 ring-inset ring-star-500/30 sm:mx-5">
      <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-star-700" strokeWidth={2.25} />
      <span>
        Ghi nhận bởi <strong className="font-semibold">{incident.createdByName}</strong> lúc {fmtDateTime(incident.createdAt)}
        {access.ok && access.timeLimited ? ` · thầy/cô ${formatRemaining(access.remainingMs)} để sửa.` : "."}
      </span>
    </p>
  );
}
