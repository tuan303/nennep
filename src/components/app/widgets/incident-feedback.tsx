"use client";
import { useState, type FormEvent } from "react";
import { MessageSquareText, PencilLine, Send } from "lucide-react";
import { Button, Field, Select, Textarea, toast } from "@/components/ui";
import type { GvcnFeedbackInput } from "@/lib/contract";
import { api, errorMessage, fieldErrors } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { INCIDENT_STATUSES } from "@/lib/constants";
import type { Incident, IncidentStatus } from "@/lib/types";

const NOTE_MAX = 1000;
const STATUS_OPTIONS = INCIDENT_STATUSES.map((s) => ({ value: s, label: s }));

/** Existing GVCN feedback (note, author, time). */
export function FeedbackView({ incident: i }: { incident: Incident }) {
  if (!i.gvcnNote?.trim()) {
    return <p className="text-sm text-slate-500">Chưa có phản hồi của GVCN.</p>;
  }
  return (
    <figure className="flex flex-col gap-1.5 rounded-xl border-l-4 border-star-500 bg-star-50/60 px-3.5 py-2.5">
      <blockquote className="whitespace-pre-line text-sm leading-6 text-slate-800">{i.gvcnNote.trim()}</blockquote>
      <figcaption className="flex items-center gap-1.5 text-xs text-slate-500">
        <MessageSquareText aria-hidden className="size-3.5" strokeWidth={2.25} />
        {[i.gvcnNoteBy, i.gvcnNoteAt ? fmtDateTime(i.gvcnNoteAt) : ""].filter(Boolean).join(" · ") || "GVCN"}
      </figcaption>
    </figure>
  );
}

export interface FeedbackFormProps {
  incident: Incident;
  /** Called with the updated incident returned by the API. */
  onSaved: (incident: Incident) => void | Promise<void>;
  /** Shows a "Hủy" button. */
  onCancel?: () => void;
}

/** GVCN note + processing status (POST /api/incidents/:id/feedback). Only changed fields are sent. */
export function FeedbackForm({ incident, onSaved, onCancel }: FeedbackFormProps) {
  const [note, setNote] = useState(incident.gvcnNote ?? "");
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const noteChanged = note.trim() !== (incident.gvcnNote ?? "").trim();
  const statusChanged = status !== incident.status;
  const tooLong = note.length > NOTE_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || tooLong || (!noteChanged && !statusChanged)) return;
    const payload: GvcnFeedbackInput = {};
    if (noteChanged) payload.note = note.trim();
    if (statusChanged) payload.status = status;
    setSaving(true);
    setError(undefined);
    try {
      const updated = await api.incidents.feedback(incident.id, payload);
      toast.success("Đã lưu phản hồi của GVCN.");
      await onSaved(updated);
    } catch (err) {
      const fe = fieldErrors(err);
      setError(fe.note ?? fe.status ?? undefined);
      toast.error(errorMessage(err, "Chưa lưu được phản hồi. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-border bg-surface-2 p-3.5">
      <Field
        label="Nội dung phản hồi"
        error={tooLong ? `Tối đa ${NOTE_MAX} ký tự.` : error}
        labelAside={<span className="num">{note.length}/{NOTE_MAX}</span>}
      >
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: Đã trao đổi với học sinh và phụ huynh, học sinh hứa sửa đổi."
          rows={3}
          maxLength={NOTE_MAX + 200}
        />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Trạng thái xử lý" className="sm:w-56">
          <Select<IncidentStatus> options={STATUS_OPTIONS} value={status} onChange={(v) => v && setStatus(v)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Hủy
            </Button>
          ) : null}
          <Button type="submit" icon={Send} loading={saving} disabled={tooLong || (!noteChanged && !statusChanged)}>
            Gửi phản hồi
          </Button>
        </div>
      </div>
    </form>
  );
}

export interface FeedbackSectionProps {
  incident: Incident;
  /** The viewer may write feedback (GVCN of the class or ADMIN). */
  canEdit: boolean;
  onSaved: (incident: Incident) => void | Promise<void>;
}

/**
 * Feedback block: the current note, and for allowed users a form (open directly when there is no note yet,
 * behind "Cập nhật phản hồi" otherwise). Key it by the incident version so it collapses after saving.
 */
export function FeedbackSection({ incident, canEdit, onSaved }: FeedbackSectionProps) {
  const hasNote = !!incident.gvcnNote?.trim();
  const [editing, setEditing] = useState(!hasNote);
  if (!canEdit) return <FeedbackView incident={incident} />;
  return (
    <div className="flex flex-col gap-3">
      {hasNote ? <FeedbackView incident={incident} /> : null}
      {editing ? (
        <FeedbackForm incident={incident} onSaved={onSaved} onCancel={hasNote ? () => setEditing(false) : undefined} />
      ) : (
        <Button variant="outline" size="sm" icon={PencilLine} onClick={() => setEditing(true)} className="self-start">
          Cập nhật phản hồi / trạng thái
        </Button>
      )}
    </div>
  );
}
