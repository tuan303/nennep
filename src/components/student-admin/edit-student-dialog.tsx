"use client";
import { useId } from "react";
import { PencilLine, Save } from "lucide-react";
import { useRetained } from "@/components/app/widgets";
import { Button, DateInput, Dialog, DialogClose, ErrorState, Field, Input, SegmentedControl, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { LevelDataset, StudentLite } from "@/lib/types";
import { focusFirstError, isFieldLevelError, mapServerError, useDialogForm, useStudentMutation, useStudentRecord } from "./hooks";
import { buildUpdatePatch, editFormOf, type EditField, type EditForm, type FormErrors } from "./lib/forms";
import { GENDER_OPTIONS, type GenderChoice } from "./lib/labels";
import { ChoiceGroup, StudentIdentity } from "./parts";

const FIELDS: readonly EditField[] = ["name", "dob", "gender", "note"];

export interface EditStudentDialogProps {
  ds: LevelDataset;
  /** null closes the dialog. */
  student: StudentLite | null;
  onClose: () => void;
  today: string;
}

/** "Sửa thông tin": họ tên, ngày sinh, giới tính, ghi chú (the full record is loaded first). Class/status have their own actions. */
export function EditStudentDialog({ ds, student, onClose, today }: EditStudentDialogProps) {
  const formId = useId();
  const open = student !== null;
  const shown = useRetained(student);
  const record = useStudentRecord(open ? shown?.id : null, ds.version);
  const loaded = record.status === "ready" ? record.student : undefined;
  const [state, setState] = useDialogForm<{ form: EditForm; errors: FormErrors<EditField> }>(open, `${shown?.id}|${loaded ? 1 : 0}`, () => ({
    form: editFormOf(loaded ?? { name: shown?.name ?? "", dob: shown?.dob }),
    errors: {},
  }));
  const { form, errors } = state;
  const { run, pending } = useStudentMutation(ds.levelId);
  const check = loaded ? buildUpdatePatch(form, loaded, today) : undefined;

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setState((s) => ({ form: { ...s.form, [key]: value }, errors: { ...s.errors, [key]: undefined } }));
  }

  async function submit() {
    if (!loaded || !shown) return;
    const r = buildUpdatePatch(form, loaded, today);
    if (!r.value) {
      setState((s) => ({ ...s, errors: r.errors }));
      focusFirstError(formId, r.errors);
      return;
    }
    const patch = r.value;
    const res = await run(() => api.students.update(loaded.id, patch), (s) => `Đã cập nhật thông tin của ${s.name}.`, { silentError: isFieldLevelError });
    if (res.ok) onClose();
    else if (isFieldLevelError(res.error)) setState((s) => ({ ...s, errors: mapServerError(res.error, FIELDS) }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && !pending && onClose()}
      dismissible={!pending}
      title="Sửa thông tin học sinh"
      description="Đổi lớp hoặc trạng thái bằng các thao tác Chuyển lớp / Chuyển trường đi."
      icon={PencilLine}
      size="md"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} icon={Save} loading={pending} disabled={!check?.changed}>
            Lưu thay đổi
          </Button>
        </>
      }
    >
      {shown ? <StudentIdentity student={shown} className="mb-4" /> : null}
      {record.status === "error" ? (
        <ErrorState size="sm" title="Chưa tải được hồ sơ" message={record.error} onRetry={record.reload} />
      ) : !loaded ? (
        <div role="status" aria-live="polite" className="grid gap-4 sm:grid-cols-2">
          <span className="sr-only">Đang tải hồ sơ học sinh</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={i === 0 || i === 3 ? "flex flex-col gap-2 sm:col-span-2" : "flex flex-col gap-2"}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-control" />
            </div>
          ))}
        </div>
      ) : (
        <form
          id={formId}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Họ và tên" required error={errors.name} className="sm:col-span-2" htmlFor={`${formId}-name`}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" maxLength={120} />
          </Field>
          <Field label="Ngày sinh" error={errors.dob} htmlFor={`${formId}-dob`}>
            <DateInput value={form.dob} onChange={(v) => set("dob", v)} max={today} />
          </Field>
          <ChoiceGroup label="Giới tính">
            <SegmentedControl<GenderChoice> ariaLabel="Giới tính" className="w-full [&>button]:flex-auto" value={form.gender} onChange={(v) => set("gender", v)} options={GENDER_OPTIONS} />
          </ChoiceGroup>
          <Field label="Ghi chú" error={errors.note} className="sm:col-span-2" htmlFor={`${formId}-note`}>
            <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={500} placeholder="Thông tin cần lưu ý về học sinh" />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
