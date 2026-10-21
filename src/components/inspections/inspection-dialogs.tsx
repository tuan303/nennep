"use client";
import { useMemo, useState } from "react";
import { CircleAlert, Pencil, Save } from "lucide-react";
import { useRetained } from "@/components/app/widgets";
import { Button, ConfirmDialog, Dialog, DialogClose, Field, Textarea, toast } from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import type { Inspection, LevelDataset } from "@/lib/types";
import { InspectionFields } from "./inspection-fields";
import {
  inspectionFormFromRecord,
  inspectionSummary,
  isInspectionPatchEmpty,
  toInspectionUpdateInput,
  validateInspectionForm,
  type InspectionForm,
} from "./lib/inspection-form";

export interface InspectionEditDialogProps {
  ds: LevelDataset;
  today: string;
  /** Round to edit; null closes. */
  inspection: Inspection | null;
  onClose: () => void;
}

/** Sửa đợt kiểm tra (ADMIN any, EDITOR own ≤ 24 h). PATCH sends only changed fields + `baseRev`; 409 → reload. */
export function InspectionEditDialog({ ds, today, inspection, onClose }: InspectionEditDialogProps) {
  const shown = useRetained(inspection);
  return (
    <Dialog
      open={inspection !== null}
      onOpenChange={(open) => !open && onClose()}
      title={shown ? `Sửa đợt kiểm tra ${shown.code}` : "Sửa đợt kiểm tra"}
      description="Mã đợt giữ nguyên; tuần và học kỳ được tính lại theo ngày."
      icon={Pencil}
      size="lg"
      dismissible={false}
    >
      {shown ? <EditBody key={`${shown.id}@${shown.rev ?? 0}`} ds={ds} today={today} inspection={shown} onDone={onClose} /> : null}
    </Dialog>
  );
}

function EditBody({ ds, today, inspection, onDone }: { ds: LevelDataset; today: string; inspection: Inspection; onDone: () => void }) {
  const { refresh } = useDataset(ds.levelId);
  const [form, setForm] = useState<InspectionForm>(() => inspectionFormFromRecord(inspection));
  const [saving, setSaving] = useState(false);
  const issues = useMemo(() => validateInspectionForm(form, ds, today, inspection), [form, ds, today, inspection]);
  const patch = useMemo(() => toInspectionUpdateInput(form, inspection, ds.classes), [form, inspection, ds.classes]);
  const unchanged = isInspectionPatchEmpty(patch);

  async function save() {
    if (saving || issues.length > 0) return;
    if (unchanged) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      const updated = await api.inspections.update(inspection.id, patch);
      toast.success(`Đã cập nhật ${updated.code} · ${fmtNumber(updated.classCodes.length)} lớp`);
      await refresh();
      onDone();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        toast.error(err.message, { description: "Đã tải lại dữ liệu mới nhất – mở lại đợt kiểm tra để sửa." });
        await refresh();
        onDone();
        return;
      }
      toast.error(errorMessage(err, "Chưa cập nhật được đợt kiểm tra. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void save();
        }
      }}
      className="flex flex-col gap-4"
    >
      <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Thông tin đợt kiểm tra</legend>
        <InspectionFields
          ds={ds}
          form={form}
          onChange={(p) => setForm((f) => ({ ...f, ...p }))}
          today={today}
          keepCategory={inspection.category}
          keepClasses={inspection.classCodes}
        />
      </fieldset>
      {issues.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[13px] text-warn-strong" aria-live="polite">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
          {issues[0]}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="secondary" disabled={saving}>
            Hủy
          </Button>
        </DialogClose>
        <Button icon={Save} onClick={() => void save()} loading={saving} disabled={issues.length > 0}>
          {unchanged ? "Đóng" : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
}

export interface InspectionDeleteDialogProps {
  ds: Pick<LevelDataset, "levelId">;
  inspection: Inspection | null;
  onClose: () => void;
}

/** Soft delete with a required reason (≥ 3 characters, kept in the audit log). */
export function InspectionDeleteDialog({ ds, inspection, onClose }: InspectionDeleteDialogProps) {
  const shown = useRetained(inspection);
  const { refresh } = useDataset(ds.levelId);
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open={inspection !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
      tone="danger"
      title={`Xóa đợt kiểm tra ${shown?.code ?? ""}?`}
      message={shown ? `${inspectionSummary(shown)}. Đợt kiểm tra sẽ không còn được tính vào độ bao phủ kiểm tra.` : undefined}
      confirmLabel="Xóa đợt kiểm tra"
      confirmDisabled={reason.trim().length < 3}
      onConfirm={async () => {
        if (!shown) return;
        try {
          await api.inspections.remove(shown.id, reason.trim());
          toast.success(`Đã xóa đợt kiểm tra ${shown.code}.`);
          setReason("");
          await refresh();
        } catch (err) {
          toast.error(errorMessage(err, "Chưa xóa được đợt kiểm tra. Vui lòng thử lại."));
          throw err;
        }
      }}
    >
      <Field label="Lý do xóa" required hint="Tối thiểu 3 ký tự, được lưu vào nhật ký hệ thống.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Ví dụ: Ghi nhầm ngày, ghi trùng…" />
      </Field>
    </ConfirmDialog>
  );
}
