"use client";
import { useId, useMemo } from "react";
import { ArrowDown, ArrowLeftRight, ArrowRight } from "lucide-react";
import { ClassPicker, useRetained } from "@/components/app/widgets";
import { Button, DateInput, Dialog, DialogClose, Field, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { LevelDataset, StudentLite } from "@/lib/types";
import { focusFirstError, isFieldLevelError, mapServerError, useDialogForm, useStudentMutation } from "./hooks";
import { validateTransfer, type FormErrors, type TransferField, type TransferForm } from "./lib/forms";
import { Callout, StudentIdentity } from "./parts";

const FIELDS: readonly TransferField[] = ["toClassCode", "effectiveDate", "note"];

export interface TransferDialogProps {
  ds: LevelDataset;
  student: StudentLite | null;
  onClose: () => void;
  today: string;
}

/** "Chuyển lớp": an ACTIVE student moves to another active class of the level (AC-019: past incidents stay with the old class). */
export function TransferDialog({ ds, student, onClose, today }: TransferDialogProps) {
  const formId = useId();
  const open = student !== null;
  const shown = useRetained(student);
  const [state, setState] = useDialogForm<{ form: TransferForm; errors: FormErrors<TransferField> }>(open, shown?.id ?? "", () => ({
    form: { toClassCode: "", effectiveDate: today, note: "" },
    errors: {},
  }));
  const { form, errors } = state;
  const { run, pending } = useStudentMutation(ds.levelId);
  const current = shown ? ds.classes.find((c) => c.code === shown.classCode) : undefined;
  const target = form.toClassCode ? ds.classes.find((c) => c.code === form.toClassCode) : undefined;
  const disabled = useMemo(() => (shown ? [shown.classCode] : []), [shown]);

  function set<K extends keyof TransferForm>(key: K, value: TransferForm[K]) {
    setState((s) => ({ form: { ...s.form, [key]: value }, errors: { ...s.errors, [key]: undefined } }));
  }

  async function submit() {
    if (!shown) return;
    const r = validateTransfer(form, shown.classCode);
    if (!r.value) {
      setState((s) => ({ ...s, errors: r.errors }));
      focusFirstError(formId, r.errors);
      return;
    }
    const input = r.value;
    const res = await run(() => api.students.transfer(shown.id, input), (s) => `Đã chuyển ${s.name} sang lớp ${s.classCode}.`, { silentError: isFieldLevelError });
    if (res.ok) onClose();
    else if (isFieldLevelError(res.error)) setState((s) => ({ ...s, errors: mapServerError(res.error, FIELDS) }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && !pending && onClose()}
      dismissible={!pending}
      title="Chuyển lớp"
      icon={ArrowLeftRight}
      size="md"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} icon={ArrowLeftRight} loading={pending}>
            Chuyển lớp
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

          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[13.5px] font-semibold leading-5 text-slate-800">Lớp hiện tại</span>
              <div className="flex h-11 items-center gap-2 rounded-control bg-surface-3 px-3 ring-1 ring-inset ring-border sm:h-10">
                <span className="num font-semibold text-brand-900">{shown.classCode}</span>
                {current?.homeroomTeacher ? <span className="truncate text-[13px] text-slate-500">{current.homeroomTeacher}</span> : null}
              </div>
            </div>
            <span aria-hidden className="flex justify-center text-slate-400 sm:mt-9">
              <ArrowRight className="hidden size-5 sm:block" strokeWidth={2.25} />
              <ArrowDown className="size-5 sm:hidden" strokeWidth={2.25} />
            </span>
            <Field label="Lớp mới" required error={errors.toClassCode} htmlFor={`${formId}-toClassCode`}>
              <ClassPicker
                ds={ds}
                value={form.toClassCode || undefined}
                disabledCodes={disabled}
                onChange={(code) => set("toClassCode", code)}
                invalid={!!errors.toClassCode}
                placeholder="Chọn lớp mới"
              />
            </Field>
          </div>

          {target && current && target.grade !== current.grade ? (
            <Callout tone="warn">
              Lớp {target.code} thuộc khối {target.grade}, khác khối hiện tại ({current.grade}). Hãy kiểm tra lại nếu đây không phải chuyển khối.
            </Callout>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ngày hiệu lực" required error={errors.effectiveDate} htmlFor={`${formId}-effectiveDate`}>
              <DateInput value={form.effectiveDate} onChange={(v) => set("effectiveDate", v)} />
            </Field>
            <Field label="Ghi chú" error={errors.note} className="sm:col-span-2" htmlFor={`${formId}-note`}>
              <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={500} placeholder="VD: Theo đơn đề nghị của phụ huynh" />
            </Field>
          </div>

          <Callout tone="brand" title="Lịch sử vi phạm ở lớp cũ được giữ nguyên">
            Các sự việc đã ghi vẫn tính cho lớp {shown.classCode}. Ngay sau khi lưu, học sinh có tên trong danh sách nhập liệu của lớp mới.
          </Callout>
        </form>
      ) : null}
    </Dialog>
  );
}
