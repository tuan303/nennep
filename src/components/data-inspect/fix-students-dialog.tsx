"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Eye, Save, ScrollText, Sparkles, UserPlus } from "lucide-react";
import { Button, DataCheckBadge, Dialog, DialogClose, Field, NumberStepper, Pill, SegmentedControl, toast } from "@/components/ui";
import { FormulaText, PenaltyPill, StudentPicker, activeStudentsOfClass, canEditIncident, useNow, useRetained } from "@/components/app/widgets";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDate, fmtNumber, fmtPoints } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import type { Incident, LevelDataset, Scope } from "@/lib/types";
import { Notice } from "./notice";
import { NO_EDIT_RIGHTS } from "./review-item";
import { allowsUnnamed, fixChanged, fixPreview, fixUpdateInput, initialFixDraft, legacyNotes, legacySuggestions, type FixDraft } from "./lib/review-queue";

export interface FixStudentsDialogProps {
  ds: LevelDataset;
  /** Incident to fix; null closes the dialog. */
  incident: Incident | null;
  onClose: () => void;
  /** Opens the full record (IncidentDetailSheet). */
  onOpenRecord: (incident: Incident) => void;
}

const SCOPE_OPTIONS: Array<{ value: Scope; label: string }> = [
  { value: "Cá nhân", label: "Cá nhân" },
  { value: "Tập thể", label: "Tập thể" },
];

/** "Bổ sung học sinh": name the students of a /HS record (or count unnamed ones) with a live points preview. */
export function FixStudentsDialog({ ds, incident, onClose, onOpenRecord }: FixStudentsDialogProps) {
  const shown = useRetained(incident);
  // A new form state every time the dialog opens (also when the same record is reopened after "Hủy").
  const [prev, setPrev] = useState<Incident | null>(incident);
  const [session, setSession] = useState(0);
  if (incident !== prev) {
    setPrev(incident);
    if (incident) setSession((s) => s + 1);
  }
  if (!shown) return null;
  return <FixDialogBody key={`${shown.id}-${session}`} ds={ds} incident={shown} open={incident !== null} onClose={onClose} onOpenRecord={onOpenRecord} />;
}

interface FixDialogBodyProps {
  ds: LevelDataset;
  incident: Incident;
  open: boolean;
  onClose: () => void;
  onOpenRecord: (incident: Incident) => void;
}

function FixDialogBody({ ds, incident, open, onClose, onOpenRecord }: FixDialogBodyProps) {
  const { profile } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const today = useToday();
  const now = useNow();
  const [draft, setDraft] = useState<FixDraft>(() => initialFixDraft(incident));
  const [saving, setSaving] = useState(false);

  const canEdit = canEditIncident(profile, incident, now);
  const roster = useMemo(() => activeStudentsOfClass(ds.students, incident.classCode), [ds.students, incident.classCode]);
  const notes = useMemo(() => legacyNotes(incident), [incident]);
  const suggestions = useMemo(() => legacySuggestions(incident, roster), [incident, roster]);
  const preview = useMemo(
    () => fixPreview(incident, draft, { classes: ds.classes, students: ds.students, catalog: ds.catalog, today }),
    [incident, draft, ds.classes, ds.students, ds.catalog, today],
  );
  const changed = fixChanged(incident, draft);
  const unnamedAllowed = allowsUnnamed(incident.unit, draft.scope);
  const selected = new Set(draft.studentIds);
  const canSave = canEdit && changed && preview.errors.length === 0;

  const toggleStudent = (id: string) =>
    setDraft((d) => ({ ...d, studentIds: d.studentIds.includes(id) ? d.studentIds.filter((x) => x !== id) : [...d.studentIds, id] }));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const updated = await api.incidents.update(incident.id, fixUpdateInput(incident, draft));
      toast.success(`Đã cập nhật sự việc ${incident.code}`, { description: `Điểm trừ: ${fmtNumber(updated.points)} · ${updated.relatedStudentCount} HS liên quan` });
      await refresh();
      onClose();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        // Changed (or deleted) by someone else since the dialog opened: reload and let the user look again.
        toast.error(err.message, { description: "Đã tải lại dữ liệu mới nhất – mở lại sự việc để bổ sung." });
        await refresh();
        onClose();
        return;
      }
      toast.error(errorMessage(err, "Chưa lưu được sự việc. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <DialogClose asChild>
        <Button variant="secondary" disabled={saving}>
          Hủy
        </Button>
      </DialogClose>
      <Button variant="primary" icon={Save} loading={saving} disabled={!canSave} onClick={() => void save()}>
        Lưu thay đổi
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title="Bổ sung học sinh"
      description={`${incident.code} · Lớp ${incident.classCode} · ${fmtDate(incident.date)}`}
      icon={UserPlus}
      size="lg"
      dismissible={!changed && !saving}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 rounded-control bg-surface-2 px-3 py-2.5 text-sm ring-1 ring-inset ring-border">
          <span className="font-bold text-slate-500">{incident.errorCode}</span>
          <span className="min-w-0 flex-1 font-medium text-slate-800">{incident.issue}</span>
          <PenaltyPill penalty={incident.penalty} unit={incident.unit} />
        </div>

        {!canEdit ? (
          <Notice
            tone="warn"
            title={NO_EDIT_RIGHTS}
            action={
              <Button variant="secondary" size="sm" icon={Eye} onClick={() => onOpenRecord(incident)}>
                Mở sự việc
              </Button>
            }
          >
            Thầy/cô có thể xem gợi ý bên dưới và báo người tạo hoặc quản trị viên cập nhật.
          </Notice>
        ) : null}

        {notes.length > 0 ? (
          <div className="flex flex-col gap-2.5 rounded-control bg-star-50 px-3.5 py-3 ring-1 ring-inset ring-star-500/35">
            <div className="flex items-start gap-2.5">
              <ScrollText aria-hidden className="mt-0.5 size-[18px] shrink-0 text-star-700" strokeWidth={2.25} />
              <div className="min-w-0">
                <p className="text-2xs font-bold uppercase tracking-wide text-star-800">Ghi chú trong file cũ</p>
                {notes.map((n, k) => (
                  <p key={k} className="text-base font-semibold text-brand-950">
                    {n}
                  </p>
                ))}
              </div>
            </div>
            {suggestions.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
                  <Sparkles aria-hidden className="size-3.5 text-star-700" strokeWidth={2.25} />
                  Học sinh có tên phù hợp trong lớp {incident.classCode} – chạm để chọn:
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Pill key={s.id} active={selected.has(s.id)} onClick={() => toggleStudent(s.id)} disabled={!canEdit} aria-label={`${s.name}, mã ${s.id}`}>
                      {s.name} · {s.id}
                    </Pill>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-slate-600">Không tìm thấy học sinh trùng tên trong lớp {incident.classCode} – hãy chọn trong danh sách bên dưới.</p>
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <p className="text-[13.5px] font-semibold leading-5 text-slate-800">Phạm vi</p>
          <SegmentedControl options={SCOPE_OPTIONS} value={draft.scope} onChange={(scope) => setDraft((d) => ({ ...d, scope }))} ariaLabel="Phạm vi" className="w-fit" />
          <p className="text-xs text-slate-500">Cá nhân cần ít nhất một học sinh có tên; Tập thể cho phép thêm số HS chưa rõ tên.</p>
        </div>

        <Field label="Học sinh liên quan" required={draft.scope === "Cá nhân"}>
          <StudentPicker
            ds={ds}
            classCode={incident.classCode}
            value={draft.studentIds}
            keptStudents={incident.students}
            onChange={(studentIds) => setDraft((d) => ({ ...d, studentIds }))}
            disabled={!canEdit}
          />
        </Field>

        {unnamedAllowed ? (
          <Field label="Số HS chưa rõ tên" hint="Chỉ dùng khi chưa xác định được tên – sự việc sẽ ở trạng thái Thiếu tên HS (vẫn tính điểm).">
            <NumberStepper value={draft.unnamedCount} onChange={(unnamedCount) => setDraft((d) => ({ ...d, unnamedCount }))} min={0} max={80} suffix="HS" disabled={!canEdit} />
          </Field>
        ) : null}

        <section aria-label="Kết quả sau khi lưu" className="flex flex-col gap-2 rounded-control bg-brand-50/60 px-3.5 py-3 ring-1 ring-inset ring-brand-600/15" aria-live="polite">
          <p className="text-2xs font-bold uppercase tracking-wide text-brand-700">Sau khi lưu</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="num text-slate-500 line-through decoration-slate-300">{fmtPoints(-incident.points)}</span>
            <ArrowRight aria-hidden className="size-4 text-slate-400" />
            <FormulaText
              input={{ unit: incident.unit, penalty: incident.penalty, namedCount: preview.namedCount, unnamedCount: preview.unnamedCount, occurrenceCount: incident.occurrenceCount }}
              total={preview.points}
              icon
            />
            <DataCheckBadge dataCheck={preview.dataCheck} size="sm" className="ml-auto" />
          </div>
        </section>

        {preview.errors.length > 0 && changed ? (
          <Notice tone="bad" role="alert" title="Chưa thể lưu">
            <ul className="list-disc pl-4">
              {preview.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}
