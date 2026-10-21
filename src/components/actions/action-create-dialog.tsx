"use client";
/** "Tạo hành động" dialog (ActionCreateSchema). Remount with a new `key` to start from a new draft. */
import { useId, useState, type FormEvent } from "react";
import { ListPlus } from "lucide-react";
import { Button, Dialog, DialogClose, toast } from "@/components/ui";
import { api, errorMessage, fieldErrors } from "@/lib/client/api";
import type { ActionItem, LevelDataset } from "@/lib/types";
import { ActionFormFields } from "./action-form-fields";
import {
  emptyActionForm,
  hasErrors,
  suggestedDeadline,
  toCreateInput,
  validateActionForm,
  type ActionFormErrors,
  type ActionFormValues,
} from "./lib/action-form";

export interface ActionCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ds: Pick<LevelDataset, "levelId" | "classes" | "weeks" | "config">;
  today: string;
  /** Prefill (e.g. from a Decision Brief recommendation). */
  initial?: ActionFormValues;
  /** Where the draft comes from, shown under the title. */
  sourceText?: string;
  onCreated: (item: ActionItem) => void | Promise<void>;
  /** Adds a "Xem" button to the success toast. */
  onView?: (item: ActionItem) => void;
}

export function ActionCreateDialog({ open, onOpenChange, ds, today, initial, sourceText, onCreated, onView }: ActionCreateDialogProps) {
  const formId = useId();
  const [form, setForm] = useState<ActionFormValues>(() => initial ?? emptyActionForm(today, ds.config.actionSlaDays));
  const [errors, setErrors] = useState<ActionFormErrors>({});
  const [pending, setPending] = useState(false);
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [dirty, setDirty] = useState(false);

  function patch(p: Partial<ActionFormValues>) {
    setDirty(true);
    if (p.deadline !== undefined) setDeadlineTouched(true);
    setForm((f) => {
      const next = { ...f, ...p };
      if (p.priority && !deadlineTouched && p.deadline === undefined) next.deadline = suggestedDeadline(today, p.priority, ds.config.actionSlaDays);
      return next;
    });
    setErrors((e) => {
      const keys = Object.keys(p) as Array<keyof ActionFormValues>;
      if (!keys.some((k) => e[k])) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (pending) return;
    const errs = validateActionForm(form, { today });
    setErrors(errs);
    if (hasErrors(errs)) {
      toast.error("Vui lòng kiểm tra lại các trường được đánh dấu.");
      return;
    }
    setPending(true);
    try {
      const item = await api.actions.create(toCreateInput(ds.levelId, form));
      toast.success("Đã tạo hành động", {
        description: `${item.code} · ${item.title}`,
        action: onView ? { label: "Xem", onClick: () => onView(item) } : undefined,
      });
      onOpenChange(false);
      await onCreated(item);
    } catch (err) {
      setErrors((prev) => ({ ...prev, ...(fieldErrors(err) as ActionFormErrors) }));
      toast.error(errorMessage(err, "Không tạo được hành động. Vui lòng thử lại."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!pending ? onOpenChange(v) : undefined)}
      title="Tạo hành động"
      description={sourceText ?? "Giao việc cải thiện nền nếp với người phụ trách và hạn xử lý rõ ràng."}
      icon={ListPlus}
      size="lg"
      dismissible={!dirty && !pending}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={pending} icon={ListPlus}>
            Tạo hành động
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="pt-1">
        <ActionFormFields ds={ds} value={form} onChange={patch} errors={errors} mode="create" today={today} disabled={pending} />
      </form>
    </Dialog>
  );
}
