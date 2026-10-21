"use client";
import { useId, useState, type FormEvent } from "react";
import { MessageSquareReply, Send } from "lucide-react";
import { Button, Dialog, DialogClose, Field, Pill, Select, Textarea, toast } from "@/components/ui";
import { useRetained } from "@/components/app/widgets";
import { api, errorMessage, fieldErrors } from "@/lib/client/api";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import { INCIDENT_STATUSES } from "@/lib/constants";
import type { Incident, IncidentStatus } from "@/lib/types";
import { feedbackPayload, subjectText } from "./lib/report-model";

const NOTE_MAX = 1000;
const STATUS_OPTIONS = INCIDENT_STATUSES.map((s) => ({ value: s, label: s }));
/** Quick phrases GVCN often write (tap to append). */
const PHRASES = ["Đã nhắc nhở học sinh.", "Đã trao đổi với phụ huynh.", "Học sinh đã nhận lỗi và cam kết sửa đổi."];

export interface FeedbackDialogProps {
  /** Incident to answer; null closes the dialog. */
  incident: Incident | null;
  onClose: () => void;
  /** Called after a successful save (refresh the dataset here). */
  onSaved: () => Promise<void>;
}

/** Quick GVCN feedback: note + processing status → POST /api/incidents/:id/feedback. */
export function FeedbackDialog({ incident, onClose, onSaved }: FeedbackDialogProps) {
  const shown = useRetained(incident);
  if (!shown) return null;
  return <FeedbackDialogInner key={shown.id} incident={shown} open={incident !== null} onClose={onClose} onSaved={onSaved} />;
}

function FeedbackDialogInner({ incident, open, onClose, onSaved }: { incident: Incident; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const formId = useId();
  const [note, setNote] = useState(incident.gvcnNote ?? "");
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const payload = feedbackPayload(incident, note, status);
  const tooLong = note.length > NOTE_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!payload || saving || tooLong) return;
    setSaving(true);
    setError(undefined);
    try {
      await api.incidents.feedback(incident.id, payload);
      toast.success("Đã lưu phản hồi của GVCN.");
      await onSaved();
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      setError(fe.note ?? fe.status);
      toast.error(errorMessage(err, "Chưa lưu được phản hồi. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  const append = (phrase: string) => setNote((n) => (n.trim() ? `${n.trim()} ${phrase}` : phrase));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
      dismissible={!saving}
      icon={MessageSquareReply}
      title="Phản hồi của GVCN"
      description={`${fmtDate(incident.date)} · ${incident.errorCode} – ${incident.issue}`}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" disabled={saving}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} icon={Send} loading={saving} disabled={!payload || tooLong}>
            Gửi phản hồi
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5 rounded-control bg-surface-2 px-3 py-2.5 text-[13px] ring-1 ring-inset ring-border">
          <span className="font-semibold text-slate-900">{subjectText(incident)}</span>
          <span className="num text-slate-600">
            Lớp {incident.classCode} · {fmtNumber(incident.points)} điểm trừ · {incident.code}
          </span>
        </div>
        <Field
          label="Nội dung phản hồi"
          error={tooLong ? `Tối đa ${NOTE_MAX} ký tự.` : error}
          labelAside={
            <span className="num">
              {note.length}/{NOTE_MAX}
            </span>
          }
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Đã trao đổi với học sinh và phụ huynh, học sinh hứa sửa đổi."
            rows={4}
            maxLength={NOTE_MAX + 200}
            autoFocus
          />
        </Field>
        <div className="flex flex-wrap gap-2" aria-label="Câu phản hồi nhanh" role="group">
          {PHRASES.map((p) => (
            <Pill key={p} onClick={() => append(p)} tone="brand">
              {p}
            </Pill>
          ))}
        </div>
        <Field label="Trạng thái xử lý" hint="Chọn “Đã đóng” khi sự việc đã được xử lý xong.">
          <Select<IncidentStatus> options={STATUS_OPTIONS} value={status} onChange={(v) => v && setStatus(v)} />
        </Field>
      </form>
    </Dialog>
  );
}
