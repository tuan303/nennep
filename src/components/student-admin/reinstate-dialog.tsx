"use client";
import { useId } from "react";
import { RotateCcw } from "lucide-react";
import { ClassPicker, useRetained } from "@/components/app/widgets";
import { Button, DateInput, Dialog, DialogClose, Field, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { LevelDataset, StudentLite } from "@/lib/types";
import { focusFirstError, isFieldLevelError, mapServerError, useDialogForm, useStudentMutation } from "./hooks";
import { validateReinstate, type FormErrors, type ReinstateField, type ReinstateForm } from "./lib/forms";
import { Callout, StudentIdentity } from "./parts";

const FIELDS: readonly ReinstateField[] = ["classCode", "date", "note"];

export interface ReinstateDialogProps {
  ds: LevelDataset;
  student: StudentLite | null;
  onClose: () => void;
  today: string;
}

/** "Khôi phục": a transferred / graduated / inactive student becomes ACTIVE again in an active class. */
export function ReinstateDialog({ ds, student, onClose, today }: ReinstateDialogProps) {
  const formId = useId();
  const open = student !== null;
  const shown = useRetained(student);
  const [state, setState] = useDialogForm<{ form: ReinstateForm; errors: FormErrors<ReinstateField> }>(open, shown?.id ?? "", () => {
    const previous = shown ? ds.classes.find((c) => c.code === shown.classCode && c.active) : undefined;
    return { form: { classCode: previous?.code ?? "", date: today, note: "" }, errors: {} };
  });
  const { form, errors } = state;
  const { run, pending } = useStudentMutation(ds.levelId);

  function set<K extends keyof ReinstateForm>(key: K, value: ReinstateForm[K]) {
    setState((s) => ({ form: { ...s.form, [key]: value }, errors: { ...s.errors, [key]: undefined } }));
  }

  async function submit() {
    if (!shown) return;
    const r = validateReinstate(form);
    if (!r.value) {
      setState((s) => ({ ...s, errors: r.errors }));
      focusFirstError(formId, r.errors);
      return;
    }
    const input = r.value;
    const res = await run(() => api.students.reinstate(shown.id, input), (s) => `${s.name} đã trở lại Đang học (lớp ${s.classCode}).`, {
      silentError: isFieldLevelError,
    });
    if (res.ok) onClose();
    else if (isFieldLevelError(res.error)) setState((s) => ({ ...s, errors: mapServerError(res.error, FIELDS) }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && !pending && onClose()}
      dismissible={!pending}
      title="Khôi phục học sinh"
      description="Học sinh quay lại trường và trở về trạng thái Đang học."
      icon={RotateCcw}
      size="md"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} icon={RotateCcw} loading={pending}>
            Khôi phục
          </Button>
        </>
      }
    >
      {shown ? (
        <form
          id={formId}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <StudentIdentity student={shown} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vào lớp" required error={errors.classCode} htmlFor={`${formId}-classCode`} hint={`Lớp trước đây: ${shown.classCode}`}>
              <ClassPicker ds={ds} value={form.classCode || undefined} onChange={(code) => set("classCode", code)} invalid={!!errors.classCode} />
            </Field>
            <Field label="Ngày quay lại" required error={errors.date} htmlFor={`${formId}-date`}>
              <DateInput value={form.date} onChange={(v) => set("date", v)} />
            </Field>
            <Field label="Ghi chú" error={errors.note} className="sm:col-span-2" htmlFor={`${formId}-note`}>
              <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={500} placeholder="VD: Gia đình chuyển về lại Hà Nội" />
            </Field>
          </div>
          <Callout tone="brand">Lịch sử vi phạm trước đây của học sinh vẫn được giữ nguyên.</Callout>
        </form>
      ) : null}
    </Dialog>
  );
}
