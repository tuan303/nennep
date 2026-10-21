"use client";
import { useEffect, useState, type FormEvent } from "react";
import { CircleAlert, KeyRound } from "lucide-react";
import { Button, Checkbox, Dialog, DialogClose, Field, Input, toast } from "@/components/ui";
import { errorMessage } from "@/lib/client/api-errors";
import { useSession, validateNewPassword } from "@/lib/client/session";

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldName = "current" | "next" | "confirm";

const FORM_ID = "change-password-form";

/** Re-authenticates with the current password, then sets the new one (Firebase). */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { changePassword, email } = useSession();
  const [values, setValues] = useState<Record<FieldName, string>>({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string>();

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setValues({ current: "", next: "", confirm: "" });
    setShow(false);
    setFieldError({});
    setFormError(undefined);
  }, [open]);

  const set = (name: FieldName) => (value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setFieldError((e) => ({ ...e, [name]: undefined }));
    setFormError(undefined);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const errs: Partial<Record<FieldName, string>> = {};
    if (!values.current) errs.current = "Vui lòng nhập mật khẩu hiện tại.";
    const invalid = values.current ? validateNewPassword(values.current, values.next) : undefined;
    if (invalid) errs.next = invalid;
    else if (!values.next) errs.next = "Vui lòng nhập mật khẩu mới.";
    if (!errs.next && values.confirm !== values.next) errs.confirm = "Mật khẩu nhập lại không khớp.";
    setFieldError(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      await changePassword(values.current, values.next);
      toast.success("Đã đổi mật khẩu", { description: "Lần đăng nhập sau, hãy dùng mật khẩu mới." });
      onOpenChange(false);
    } catch (err) {
      setFormError(errorMessage(err, "Không đổi được mật khẩu. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !saving && onOpenChange(v)}
      title="Đổi mật khẩu"
      description="Nhập mật khẩu hiện tại để xác nhận, sau đó đặt mật khẩu mới."
      icon={KeyRound}
      size="sm"
      dismissible={!saving}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={saving}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} loading={saving}>
            Đổi mật khẩu
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        {/* Helps password managers attach the change to the right account. */}
        <input type="text" name="username" autoComplete="username" value={email ?? ""} hidden readOnly />
        <Field label="Mật khẩu hiện tại" required error={fieldError.current}>
          <Input type={type} autoComplete="current-password" value={values.current} onChange={(e) => set("current")(e.target.value)} autoFocus />
        </Field>
        <Field label="Mật khẩu mới" required error={fieldError.next} hint="Tối thiểu 8 ký tự, nên gồm cả chữ và số.">
          <Input type={type} autoComplete="new-password" value={values.next} onChange={(e) => set("next")(e.target.value)} />
        </Field>
        <Field label="Nhập lại mật khẩu mới" required error={fieldError.confirm}>
          <Input type={type} autoComplete="new-password" value={values.confirm} onChange={(e) => set("confirm")(e.target.value)} />
        </Field>
        <Checkbox checked={show} onChange={setShow} label="Hiện mật khẩu" />
        {formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-control bg-bad-soft px-3 py-2.5 text-sm text-bad-strong ring-1 ring-inset ring-bad/20">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            <span>{formError}</span>
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
