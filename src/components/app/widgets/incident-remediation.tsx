"use client";
import { useState, type FormEvent } from "react";
import { ShieldCheck, Wrench, Save } from "lucide-react";
import { Button, Field, Pill, Select, Textarea, toast } from "@/components/ui";
import { api, errorMessage, fieldErrors } from "@/lib/client/api";
import { INCIDENT_STATUSES } from "@/lib/constants";
import type { Incident, IncidentStatus } from "@/lib/types";
import { REMEDIATION_MAX, REMEDIATION_PHRASES, appendPhrase, feedbackChanges, remediationMeta } from "./lib/remediation";

const STATUS_OPTIONS = INCIDENT_STATUSES.map((s) => ({ value: s, label: s }));

/** Stored remediation (text, who, when) or "Chưa có biện pháp khắc phục." */
export function RemediationView({ incident: i }: { incident: Pick<Incident, "remediation" | "remediationBy" | "remediationAt"> }) {
  const text = i.remediation?.trim();
  if (!text) return <p className="text-sm text-slate-500">Chưa có biện pháp khắc phục.</p>;
  const meta = remediationMeta(i);
  return (
    <figure className="flex flex-col gap-1.5 rounded-xl border-l-4 border-ok bg-ok-soft/50 px-3.5 py-2.5">
      <blockquote className="whitespace-pre-line text-sm leading-6 text-slate-800">{text}</blockquote>
      {meta ? (
        <figcaption className="flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.25} />
          {meta}
        </figcaption>
      ) : null}
    </figure>
  );
}

export interface RemediationFormProps {
  incident: Incident;
  onSaved: (incident: Incident) => void | Promise<void>;
  onCancel?: () => void;
}

/** Biện pháp xử lý / khắc phục + processing status → POST /api/incidents/:id/feedback (changed fields only). */
export function RemediationForm({ incident, onSaved, onCancel }: RemediationFormProps) {
  const [text, setText] = useState(incident.remediation ?? "");
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const payload = feedbackChanges(incident, { remediation: text, status }, { note: false, status: true, remediation: true });
  const tooLong = text.length > REMEDIATION_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || tooLong || !payload) return;
    setSaving(true);
    setError(undefined);
    try {
      const updated = await api.incidents.feedback(incident.id, payload);
      toast.success(payload.remediation !== undefined ? "Đã lưu biện pháp khắc phục." : "Đã cập nhật trạng thái xử lý.");
      await onSaved(updated);
    } catch (err) {
      const fe = fieldErrors(err);
      setError(fe.remediation ?? fe.status ?? undefined);
      toast.error(errorMessage(err, "Chưa lưu được biện pháp khắc phục. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-border bg-surface-2 p-3.5">
      <Field
        label="Biện pháp xử lý / khắc phục"
        error={tooLong ? `Tối đa ${REMEDIATION_MAX} ký tự.` : error}
        labelAside={
          <span className="num">
            {text.length}/{REMEDIATION_MAX}
          </span>
        }
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ví dụ: Đã nhắc nhở học sinh, trao đổi với phụ huynh; lớp lao động vệ sinh hành lang."
          rows={3}
          maxLength={REMEDIATION_MAX + 200}
        />
      </Field>
      <div className="no-scrollbar -mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-0.5 sm:flex-wrap" role="group" aria-label="Biện pháp thường dùng">
        {REMEDIATION_PHRASES.map((p) => (
          <Pill key={p} onClick={() => setText((t) => appendPhrase(t, p))} className="shrink-0">
            {p}
          </Pill>
        ))}
      </div>
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
          <Button type="submit" icon={Save} loading={saving} disabled={tooLong || !payload}>
            Lưu khắc phục
          </Button>
        </div>
      </div>
    </form>
  );
}

export interface RemediationSectionProps {
  incident: Incident;
  /** canRemediate(profile, incident). */
  canEdit: boolean;
  onSaved: (incident: Incident) => void | Promise<void>;
}

/** Current remediation + (for allowed users) the editor behind a button. Key it by the incident version. */
export function RemediationSection({ incident, canEdit, onSaved }: RemediationSectionProps) {
  const has = !!incident.remediation?.trim();
  const [editing, setEditing] = useState(false);
  if (!canEdit) return <RemediationView incident={incident} />;
  return (
    <div className="flex flex-col gap-3">
      {has || !editing ? <RemediationView incident={incident} /> : null}
      {editing ? (
        <RemediationForm incident={incident} onSaved={onSaved} onCancel={() => setEditing(false)} />
      ) : (
        <Button variant="outline" size="sm" icon={Wrench} onClick={() => setEditing(true)} className="self-start">
          {has ? "Cập nhật biện pháp khắc phục" : "Ghi biện pháp khắc phục"}
        </Button>
      )}
    </div>
  );
}
