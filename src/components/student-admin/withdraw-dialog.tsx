"use client";
import { useId } from "react";
import { GraduationCap, LogOut, UserX } from "lucide-react";
import { useRetained } from "@/components/app/widgets";
import { Button, DateInput, Dialog, DialogClose, Field, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import { STUDENT_STATUS_LABELS } from "@/lib/constants";
import type { LevelDataset, StudentLite } from "@/lib/types";
import { focusFirstError, isFieldLevelError, mapServerError, useDialogForm, useStudentMutation } from "./hooks";
import { validateWithdraw, type FormErrors, type WithdrawField, type WithdrawForm } from "./lib/forms";
import { LEAVE_OPTIONS, leaveOption, type LeaveStatus } from "./lib/labels";
import { Callout, StudentIdentity } from "./parts";

const FIELDS: readonly WithdrawField[] = ["status", "date", "reason", "note"];
const ICONS = { TRANSFERRED_OUT: LogOut, GRADUATED: GraduationCap, INACTIVE: UserX } as const;

export interface WithdrawDialogProps {
  ds: LevelDataset;
  student: StudentLite | null;
  onClose: () => void;
  today: string;
}

/** "Chuyển trường đi / Tốt nghiệp / Ngừng theo dõi" → api.students.withdraw. Warns before confirming; history is kept. */
export function WithdrawDialog({ ds, student, onClose, today }: WithdrawDialogProps) {
  const formId = useId();
  const open = student !== null;
  const shown = useRetained(student);
  const [state, setState] = useDialogForm<{ form: WithdrawForm; errors: FormErrors<WithdrawField> }>(open, shown?.id ?? "", () => ({
    form: { status: "TRANSFERRED_OUT", date: today, reason: "", note: "" },
    errors: {},
  }));
  const { form, errors } = state;
  const { run, pending } = useStudentMutation(ds.levelId);
  const option = leaveOption(form.status);

  function set<K extends keyof WithdrawForm>(key: K, value: WithdrawForm[K]) {
    setState((s) => ({ form: { ...s.form, [key]: value }, errors: { ...s.errors, [key]: undefined } }));
  }

  async function submit() {
    if (!shown) return;
    const r = validateWithdraw(form);
    if (!r.value) {
      setState((s) => ({ ...s, errors: r.errors }));
      focusFirstError(formId, r.errors);
      return;
    }
    const input = r.value;
    const res = await run(
      () => api.students.withdraw(shown.id, input),
      (s) => `${s.name}: đã chuyển sang “${STUDENT_STATUS_LABELS[s.status]}”.`,
      { silentError: isFieldLevelError },
    );
    if (res.ok) onClose();
    else if (isFieldLevelError(res.error)) setState((s) => ({ ...s, errors: mapServerError(res.error, FIELDS) }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && !pending && onClose()}
      dismissible={!pending}
      title="Học sinh rời trường"
      description="Chuyển trường đi, tốt nghiệp hoặc ngừng theo dõi."
      icon={ICONS[form.status]}
      size="md"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} variant="danger" icon={ICONS[form.status]} loading={pending}>
            {option.confirm}
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
            <Field label="Trạng thái mới" required htmlFor={`${formId}-status`}>
              <Select<LeaveStatus>
                options={LEAVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={form.status}
                onChange={(v) => v && set("status", v)}
              />
            </Field>
            <Field label="Ngày" required error={errors.date} htmlFor={`${formId}-date`}>
              <DateInput value={form.date} onChange={(v) => set("date", v)} />
            </Field>
            <Field label={option.reasonLabel} required error={errors.reason} className="sm:col-span-2" htmlFor={`${formId}-reason`}>
              <Input value={form.reason} onChange={(e) => set("reason", e.target.value)} maxLength={300} placeholder={option.reasonPlaceholder} autoComplete="off" />
            </Field>
            <Field label="Ghi chú" error={errors.note} className="sm:col-span-2" htmlFor={`${formId}-note`}>
              <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={500} />
            </Field>
          </div>
          <Callout tone="warn" title={`Học sinh sẽ không còn trong danh sách lớp ${shown.classCode}`}>
            Em không xuất hiện khi nhập sự việc nữa. Lịch sử vi phạm vẫn được giữ và có thể khôi phục lại khi cần.
          </Callout>
        </form>
      ) : null}
    </Dialog>
  );
}
