"use client";
import { useId } from "react";
import { ArrowUpFromLine } from "lucide-react";
import { ClassPicker, useRetained } from "@/components/app/widgets";
import { Button, DateInput, Dialog, DialogClose, Field, Select, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useDataset, useLevel } from "@/lib/client/data";
import { LEVELS } from "@/lib/constants";
import type { LevelDataset, LevelId, StudentLite } from "@/lib/types";
import { focusFirstError, isFieldLevelError, mapServerError, useDialogForm, useStudentMutation } from "./hooks";
import { defaultPromoteLevel, validatePromote, type FormErrors, type PromoteField, type PromoteForm } from "./lib/forms";
import { Callout, StudentIdentity } from "./parts";

const FIELDS: readonly PromoteField[] = ["toLevelId", "classCode", "date", "note"];

export interface PromoteDialogProps {
  ds: LevelDataset;
  student: StudentLite | null;
  onClose: () => void;
  today: string;
}

/**
 * "Chuyển cấp" (INTEGRITY-9): the student keeps the school-wide Mã HS and the whole history, and becomes ACTIVE in a
 * class of another level (e.g. lớp 5 Tiểu học → lớp 6 THCS). Needs access to both levels (checked by the server).
 */
export function PromoteDialog({ ds, student, onClose, today }: PromoteDialogProps) {
  const formId = useId();
  const open = student !== null;
  const shown = useRetained(student);
  const { accessibleLevels } = useLevel();
  const targets = accessibleLevels.filter((l) => l !== ds.levelId);
  const [state, setState] = useDialogForm<{ form: PromoteForm; errors: FormErrors<PromoteField> }>(open, shown?.id ?? "", () => ({
    form: { toLevelId: defaultPromoteLevel(ds.levelId, accessibleLevels) ?? "", classCode: "", date: today, note: "" },
    errors: {},
  }));
  const { form, errors } = state;
  const { run, pending } = useStudentMutation(ds.levelId);
  // Classes of the target level: its dataset is loaded only while the dialog is open (no extra reads otherwise) and
  // refreshed after the move.
  const targetLevel: LevelId = open && form.toLevelId ? form.toLevelId : ds.levelId;
  const target = useDataset(targetLevel);
  const targetDs = form.toLevelId && target.levelId === form.toLevelId ? target.dataset : undefined;

  function set<K extends keyof PromoteForm>(key: K, value: PromoteForm[K]) {
    setState((s) => ({ form: { ...s.form, [key]: value }, errors: { ...s.errors, [key]: undefined } }));
  }

  async function submit() {
    if (!shown) return;
    const r = validatePromote(form, ds.levelId);
    if (!r.value) {
      setState((s) => ({ ...s, errors: r.errors }));
      focusFirstError(formId, r.errors);
      return;
    }
    const input = r.value;
    const res = await run(
      () => api.students.promoteLevel(shown.id, input),
      (s) => `${s.name} đã chuyển sang ${LEVELS[input.toLevelId].name}, lớp ${s.classCode}.`,
      { silentError: isFieldLevelError },
    );
    if (res.ok) {
      void target.refresh();
      onClose();
    } else if (isFieldLevelError(res.error)) setState((s) => ({ ...s, errors: mapServerError(res.error, FIELDS) }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && !pending && onClose()}
      dismissible={!pending}
      title="Chuyển cấp"
      description="Học sinh lên cấp học mới, giữ nguyên Mã HS và lịch sử."
      icon={ArrowUpFromLine}
      size="md"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} icon={ArrowUpFromLine} loading={pending} disabled={targets.length === 0}>
            Chuyển cấp
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
          {targets.length === 0 ? (
            <Callout tone="warn">Tài khoản của bạn chỉ quản lý cấp {LEVELS[ds.levelId].name} – cần quyền ở cả cấp học mới để chuyển cấp.</Callout>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cấp học mới" required error={errors.toLevelId} htmlFor={`${formId}-toLevelId`}>
                <Select<LevelId>
                  id={`${formId}-toLevelId`}
                  options={targets.map((l) => ({ value: l, label: LEVELS[l].name }))}
                  value={form.toLevelId || undefined}
                  onChange={(v) => {
                    set("toLevelId", v ?? "");
                    set("classCode", "");
                  }}
                  invalid={!!errors.toLevelId}
                />
              </Field>
              <Field label="Vào lớp" required error={errors.classCode} htmlFor={`${formId}-classCode`} hint={`Lớp hiện tại: ${shown.classCode} (${LEVELS[ds.levelId].short})`}>
                {targetDs ? (
                  <ClassPicker ds={targetDs} value={form.classCode || undefined} onChange={(code) => set("classCode", code)} invalid={!!errors.classCode} />
                ) : form.toLevelId && target.status === "error" ? (
                  <p className="text-[13px] text-bad-strong">{target.error ?? "Không tải được danh sách lớp."}</p>
                ) : (
                  <span className="flex h-11 items-center gap-2 text-[13px] text-slate-500 sm:h-10">
                    <Spinner size="sm" /> Đang tải danh sách lớp…
                  </span>
                )}
              </Field>
              <Field label="Ngày hiệu lực" required error={errors.date} htmlFor={`${formId}-date`}>
                <DateInput value={form.date} onChange={(v) => set("date", v)} />
              </Field>
              <Field label="Ghi chú" error={errors.note} className="sm:col-span-2" htmlFor={`${formId}-note`}>
                <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={500} placeholder="VD: Hoàn thành chương trình Tiểu học năm học 2025–2026" />
              </Field>
            </div>
          )}
          <Callout tone="brand" title="Mã HS và lịch sử được giữ nguyên">
            Học sinh rời danh sách {LEVELS[ds.levelId].name} và có tên trong lớp mới ngay sau khi lưu. Các sự việc đã ghi ở cấp cũ vẫn tính cho lớp cũ.
          </Callout>
        </form>
      ) : null}
    </Dialog>
  );
}
