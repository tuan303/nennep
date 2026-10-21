"use client";
import { useId } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { ClassPicker } from "@/components/app/widgets";
import { Button, DateInput, Dialog, DialogClose, Field, Input, SegmentedControl, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { LevelDataset } from "@/lib/types";
import { focusFirstError, isFieldLevelError, mapServerError, useDialogForm, useStudentMutation } from "./hooks";
import { emptyAddForm, findDuplicateStudent, duplicateMessage, validateAddForm, type AddField, type AddForm, type FormErrors } from "./lib/forms";
import { GENDER_OPTIONS, type GenderChoice } from "./lib/labels";
import { ChoiceGroup } from "./parts";

const FIELDS: readonly AddField[] = ["id", "name", "dob", "gender", "classCode", "enrollDate", "note"];

export interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ds: LevelDataset;
  today: string;
  /** Pre-selected class (the class filter of the roster). */
  defaultClass?: string;
}

/** "Thêm học sinh": tuyển mới / chuyển đến → api.students.create. "Lưu & thêm tiếp" keeps type, class and date. */
export function AddStudentDialog({ open, onOpenChange, ds, today, defaultClass }: AddStudentDialogProps) {
  const formId = useId();
  const initClass = defaultClass && ds.classes.some((c) => c.code === defaultClass && c.active) ? defaultClass : "";
  const [state, setState] = useDialogForm<{ form: AddForm; errors: FormErrors<AddField> }>(open, "add", () => ({
    form: emptyAddForm(today, { enrollType: "NEW", classCode: initClass, enrollDate: today }),
    errors: {},
  }));
  const { form, errors } = state;
  const { run, pending } = useStudentMutation(ds.levelId);

  function set<K extends keyof AddForm>(key: K, value: AddForm[K]) {
    setState((s) => ({ form: { ...s.form, [key]: value }, errors: { ...s.errors, [key]: undefined } }));
  }

  function checkId() {
    const dupe = findDuplicateStudent(ds.students, form.id);
    if (dupe) setState((s) => ({ ...s, errors: { ...s.errors, id: duplicateMessage(dupe) } }));
  }

  async function submit(addAnother: boolean) {
    const r = validateAddForm(form, { levelId: ds.levelId, students: ds.students, today });
    if (!r.value) {
      setState((s) => ({ ...s, errors: r.errors }));
      focusFirstError(formId, r.errors);
      return;
    }
    const input = r.value;
    const res = await run(() => api.students.create(input), (s) => `Đã thêm ${s.name} vào lớp ${s.classCode}.`, { silentError: isFieldLevelError });
    if (res.ok) {
      if (addAnother) {
        setState({ form: emptyAddForm(today, { enrollType: form.enrollType, classCode: form.classCode, enrollDate: form.enrollDate }), errors: {} });
        document.getElementById(`${formId}-id`)?.focus();
      } else onOpenChange(false);
    } else if (isFieldLevelError(res.error)) {
      const mapped = mapServerError(res.error, FIELDS, "id");
      setState((s) => ({ ...s, errors: mapped }));
    }
  }

  const transferIn = form.enrollType === "TRANSFER_IN";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !pending && onOpenChange(v)}
      dismissible={!pending}
      title="Thêm học sinh"
      description="Học sinh tuyển mới hoặc chuyển đến trong năm học."
      icon={UserPlus}
      size="md"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Hủy
            </Button>
          </DialogClose>
          <Button variant="outline" disabled={pending} onClick={() => void submit(true)}>
            Lưu &amp; thêm tiếp
          </Button>
          <Button type="submit" form={formId} loading={pending} icon={UserPlus}>
            Thêm học sinh
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <ChoiceGroup label="Hình thức">
          <SegmentedControl<AddForm["enrollType"]>
            ariaLabel="Hình thức nhập học"
            fullWidth
            value={form.enrollType}
            onChange={(v) => set("enrollType", v)}
            options={[
              { value: "NEW", label: "Tuyển mới", icon: UserPlus },
              { value: "TRANSFER_IN", label: "Chuyển đến", icon: LogIn },
            ]}
          />
        </ChoiceGroup>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mã HS" required error={errors.id} htmlFor={`${formId}-id`} hint={errors.id ? undefined : "Không trùng trong toàn trường."}>
            <Input value={form.id} onChange={(e) => set("id", e.target.value)} onBlur={checkId} autoComplete="off" spellCheck={false} maxLength={32} placeholder="VD: 26xxxxxx" />
          </Field>
          <Field label="Lớp" required error={errors.classCode} htmlFor={`${formId}-classCode`}>
            <ClassPicker ds={ds} value={form.classCode || undefined} onChange={(code) => set("classCode", code)} invalid={!!errors.classCode} />
          </Field>
          <Field label="Họ và tên" required error={errors.name} className="sm:col-span-2" htmlFor={`${formId}-name`}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" maxLength={120} placeholder="VD: Nguyễn Minh An" />
          </Field>
          <Field label="Ngày sinh" error={errors.dob} htmlFor={`${formId}-dob`}>
            <DateInput value={form.dob} onChange={(v) => set("dob", v)} max={today} />
          </Field>
          <ChoiceGroup label="Giới tính">
            <SegmentedControl<GenderChoice> ariaLabel="Giới tính" className="w-full [&>button]:flex-auto" value={form.gender} onChange={(v) => set("gender", v)} options={GENDER_OPTIONS} />
          </ChoiceGroup>
          <Field label={transferIn ? "Ngày chuyển đến" : "Ngày nhập học"} required error={errors.enrollDate} htmlFor={`${formId}-enrollDate`}>
            <DateInput value={form.enrollDate} onChange={(v) => set("enrollDate", v)} />
          </Field>
          <Field label="Ghi chú" error={errors.note} className="sm:col-span-2" htmlFor={`${formId}-note`}>
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              maxLength={500}
              placeholder={transferIn ? "VD: Chuyển đến từ Trường THCS Định Công theo nguyện vọng gia đình" : "VD: Tuyển bổ sung đầu năm học"}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
