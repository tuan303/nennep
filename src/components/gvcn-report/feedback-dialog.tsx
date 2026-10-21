"use client";
import { useId, useState, type FormEvent } from "react";
import { MessageSquareReply, Send, Wrench } from "lucide-react";
import { Button, Dialog, DialogClose, Field, Pill, Select, Textarea, toast } from "@/components/ui";
import { REMEDIATION_MAX, REMEDIATION_PHRASES, appendPhrase, useRetained } from "@/components/app/widgets";
import { api, errorMessage, fieldErrors } from "@/lib/client/api";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import { INCIDENT_STATUSES } from "@/lib/constants";
import type { Incident, IncidentStatus } from "@/lib/types";
import { feedbackPayload, rightsOfMode, subjectText, type FeedbackMode } from "./lib/report-model";

const NOTE_MAX = 1000;
const STATUS_OPTIONS = INCIDENT_STATUSES.map((s) => ({ value: s, label: s }));
/** Quick phrases GVCN often write (tap to append). */
const PHRASES = ["Đã nhắc nhở học sinh.", "Đã trao đổi với phụ huynh.", "Học sinh đã nhận lỗi và cam kết sửa đổi."];

export interface FeedbackDialogProps {
  /** Incident to answer; null closes the dialog. */
  incident: Incident | null;
  /**
   * "gvcn" (class GVCN / ADMIN): phản hồi + biện pháp khắc phục + trạng thái; "remediate" (EDITOR): biện pháp khắc phục
   * + trạng thái only. Default "gvcn".
   */
  mode?: FeedbackMode;
  onClose: () => void;
  /** Called after a successful save (refresh the dataset here). */
  onSaved: () => Promise<void>;
}

/** Quick feedback / remediation → POST /api/incidents/:id/feedback (only the changed, allowed fields). */
export function FeedbackDialog({ incident, mode = "gvcn", onClose, onSaved }: FeedbackDialogProps) {
  const shown = useRetained(incident);
  if (!shown) return null;
  return <FeedbackDialogInner key={`${shown.id}|${mode}`} incident={shown} mode={mode} open={incident !== null} onClose={onClose} onSaved={onSaved} />;
}

function FeedbackDialogInner({
  incident,
  mode,
  open,
  onClose,
  onSaved,
}: {
  incident: Incident;
  mode: FeedbackMode;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const formId = useId();
  const gvcn = mode === "gvcn";
  const [note, setNote] = useState(incident.gvcnNote ?? "");
  const [remediation, setRemediation] = useState(incident.remediation ?? "");
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ note?: string; remediation?: string }>({});
  const payload = feedbackPayload(incident, note, status, remediation, rightsOfMode(mode));
  const noteTooLong = gvcn && note.length > NOTE_MAX;
  const fixTooLong = remediation.length > REMEDIATION_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!payload || saving || noteTooLong || fixTooLong) return;
    setSaving(true);
    setErrors({});
    try {
      await api.incidents.feedback(incident.id, payload);
      toast.success(
        payload.note !== undefined
          ? "Đã lưu phản hồi của GVCN."
          : payload.remediation !== undefined
            ? "Đã lưu biện pháp khắc phục."
            : "Đã cập nhật trạng thái xử lý.",
      );
      await onSaved();
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors({ note: fe.note, remediation: fe.remediation ?? fe.status });
      toast.error(errorMessage(err, "Chưa lưu được. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
      dismissible={!saving}
      icon={gvcn ? MessageSquareReply : Wrench}
      title={gvcn ? "Phản hồi & khắc phục" : "Biện pháp xử lý / khắc phục"}
      description={`${fmtDate(incident.date)} · ${incident.errorCode} – ${incident.issue}`}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" disabled={saving}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} icon={gvcn ? Send : Wrench} loading={saving} disabled={!payload || noteTooLong || fixTooLong}>
            {gvcn ? "Gửi phản hồi" : "Lưu khắc phục"}
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
        {gvcn ? (
          <>
            <Field
              label="Phản hồi của GVCN"
              error={noteTooLong ? `Tối đa ${NOTE_MAX} ký tự.` : errors.note}
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
                rows={3}
                maxLength={NOTE_MAX + 200}
                autoFocus
              />
            </Field>
            <div className="flex flex-wrap gap-2" aria-label="Câu phản hồi nhanh" role="group">
              {PHRASES.map((p) => (
                <Pill key={p} onClick={() => setNote((n) => appendPhrase(n, p))} tone="brand">
                  {p}
                </Pill>
              ))}
            </div>
          </>
        ) : null}
        <Field
          label="Biện pháp xử lý / khắc phục"
          hint={gvcn ? "Không bắt buộc – biện pháp đã áp dụng với học sinh / lớp." : undefined}
          error={fixTooLong ? `Tối đa ${REMEDIATION_MAX} ký tự.` : errors.remediation}
          labelAside={
            <span className="num">
              {remediation.length}/{REMEDIATION_MAX}
            </span>
          }
        >
          <Textarea
            value={remediation}
            onChange={(e) => setRemediation(e.target.value)}
            placeholder="Ví dụ: Học sinh viết bản cam kết; lớp lao động vệ sinh hành lang."
            rows={gvcn ? 2 : 4}
            maxLength={REMEDIATION_MAX + 200}
            autoFocus={!gvcn}
          />
        </Field>
        <div className="flex flex-wrap gap-2" aria-label="Biện pháp thường dùng" role="group">
          {REMEDIATION_PHRASES.map((p) => (
            <Pill key={p} onClick={() => setRemediation((t) => appendPhrase(t, p))}>
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
