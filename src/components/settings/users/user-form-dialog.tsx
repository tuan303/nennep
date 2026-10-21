"use client";
import { useId, useState } from "react";
import { Eye, EyeOff, Lock, UserPlus, UserRoundPen } from "lucide-react";
import { Button, Dialog, Field, Input, MultiCombobox, Select, Switch, toast, type ComboOption } from "@/components/ui";
import { api, errorMessage, fieldErrors } from "@/lib/client/api";
import { LEVEL_IDS, LEVELS } from "@/lib/constants";
import type { LevelId, Role, UserProfile } from "@/lib/types";
import {
  LEVEL_LIMITED_ADMIN_HINT,
  ROLE_DESCRIPTIONS,
  ROLE_OPTIONS,
  adminGuard,
  createInputFromDraft,
  draftFromProfile,
  emptyUserDraft,
  isProtectedAdmin,
  updatePatchFromDraft,
  validateUserDraft,
  type UserDraft,
  type UserField,
} from "../lib/users";
import { Notice } from "../shared/notice";
import { GvcnClassesField } from "./gvcn-classes-field";

const LEVEL_OPTIONS: ComboOption<LevelId>[] = LEVEL_IDS.map((l) => ({ value: l, label: LEVELS[l].name, keywords: [LEVELS[l].short] }));

export type UserFormTarget = { mode: "create" } | { mode: "edit"; user: UserProfile };

export interface UserFormDialogProps {
  target: UserFormTarget | null;
  users: readonly UserProfile[];
  currentUid?: string;
  /** Levels the admin can pick homeroom classes from. */
  levels: readonly LevelId[];
  defaultLevel: LevelId;
  onClose: () => void;
  /** After a successful save. `tempPassword` only for a new account with a generated password. */
  onSaved: (profile: UserProfile, info: { created: boolean; tempPassword?: string; ownPassword: boolean }) => void;
}

/** "Thêm người dùng" / "Sửa người dùng" dialog. */
export function UserFormDialog(props: UserFormDialogProps) {
  const { target } = props;
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const editing = target?.mode === "edit";
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => !o && !busy && props.onClose()}
      icon={editing ? UserRoundPen : UserPlus}
      title={editing ? "Sửa người dùng" : "Thêm người dùng"}
      description={editing ? target.user.email : "Tài khoản đăng nhập bằng email và mật khẩu."}
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {editing ? "Lưu thay đổi" : "Tạo tài khoản"}
          </Button>
        </>
      }
    >
      {target ? <UserForm key={editing ? target.user.uid : "new"} {...props} target={target} formId={formId} busy={busy} setBusy={setBusy} /> : null}
    </Dialog>
  );
}

function UserForm({
  target,
  users,
  currentUid,
  levels,
  defaultLevel,
  onSaved,
  onClose,
  formId,
  busy,
  setBusy,
}: UserFormDialogProps & { target: UserFormTarget; formId: string; busy: boolean; setBusy: (b: boolean) => void }) {
  const profile = target.mode === "edit" ? target.user : undefined;
  const [draft, setDraft] = useState<UserDraft>(() => (profile ? draftFromProfile(profile) : emptyUserDraft()));
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Partial<Record<string, string>>>({});
  const [serverMessage, setServerMessage] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);

  const ctx = { currentUid, users };
  const locked = profile ? isProtectedAdmin(profile, ctx) : false;
  /** Own account: role, levels and lock cannot be changed (server rule). */
  const self = !!profile && profile.uid === currentUid;
  const guard = profile ? adminGuard(draft, profile, ctx) : undefined;
  const clientErrors = validateUserDraft(draft, profile ? "edit" : "create");
  const err = (f: UserField) => (submitted ? clientErrors[f] : undefined) ?? serverFields[f];
  const set = (patch: Partial<UserDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setServerFields({});
    setServerMessage(undefined);
  };

  async function submit() {
    setSubmitted(true);
    if (Object.keys(clientErrors).length > 0 || guard) return;
    setBusy(true);
    try {
      if (!profile) {
        const res = await api.users.create(createInputFromDraft(draft));
        onSaved(res.profile, { created: true, tempPassword: res.tempPassword, ownPassword: !!draft.password });
      } else {
        const patch = updatePatchFromDraft(draft, profile);
        if (Object.keys(patch).length === 0) {
          toast("Không có thay đổi để lưu");
          onClose();
          return;
        }
        const saved = await api.users.update(profile.uid, patch);
        onSaved(saved, { created: false, ownPassword: false });
      }
    } catch (e) {
      setServerFields(fieldErrors(e));
      setServerMessage(errorMessage(e));
      toast.error(profile ? "Chưa lưu được người dùng" : "Chưa tạo được tài khoản", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {serverMessage ? (
        <Notice tone="bad" live>
          {serverMessage}
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {profile ? (
          <Field label="Email đăng nhập" hint="Email không đổi được.">
            <Input value={profile.email} readOnly disabled icon={Lock} />
          </Field>
        ) : (
          <Field label="Email đăng nhập" required error={err("email")}>
            <Input
              type="email"
              value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={busy}
              placeholder="ten@hoangmaistarschool.edu.vn"
            />
          </Field>
        )}
        <Field label="Họ tên" required error={err("displayName")}>
          <Input
            value={draft.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            autoComplete="off"
            disabled={busy}
            placeholder="VD: Nguyễn Thu Hà"
          />
        </Field>
        <Field
          label="Vai trò"
          required
          error={err("role")}
          hint={locked ? "Bạn không thể đổi vai trò của tài khoản này (tài khoản của bạn hoặc quản trị viên cuối cùng)." : ROLE_DESCRIPTIONS[draft.role]}
          className="sm:col-span-2"
        >
          <Select<Role> options={ROLE_OPTIONS} value={draft.role} onChange={(v) => v && set({ role: v })} disabled={busy || locked} />
        </Field>
        {draft.role === "GVCN" ? (
          <Field label="Lớp chủ nhiệm" required error={err("gvcnClasses")} className="sm:col-span-2" hint="Cấp học của GVCN được lấy theo các lớp chủ nhiệm.">
            <GvcnClassesField
              value={draft.gvcnClasses}
              onChange={(v) => set({ gvcnClasses: v })}
              levels={levels}
              defaultLevel={defaultLevel}
              invalid={!!err("gvcnClasses")}
              disabled={busy}
            />
          </Field>
        ) : (
          <Field
            label="Cấp học được xem"
            error={err("levels")}
            hint={
              self
                ? "Bạn không thể tự thay đổi cấp học của tài khoản mình."
                : draft.role === "ADMIN" && draft.levels.length > 0
                  ? LEVEL_LIMITED_ADMIN_HINT
                  : "Để trống = tất cả cấp học."
            }
            className="sm:col-span-2"
          >
            <MultiCombobox<LevelId>
              options={LEVEL_OPTIONS}
              value={draft.levels}
              onChange={(v) => set({ levels: LEVEL_IDS.filter((l) => v.includes(l)) })}
              placeholder="Tất cả cấp học"
              title="Cấp học được xem"
              disabled={busy || self}
            />
          </Field>
        )}
        {!profile ? (
          <Field
            label="Mật khẩu (tùy chọn)"
            error={err("password")}
            hint="Để trống: hệ thống tạo mật khẩu tạm và hiển thị một lần sau khi tạo."
            className="sm:col-span-2"
          >
            <Input
              type={showPassword ? "text" : "password"}
              value={draft.password}
              onChange={(e) => set({ password: e.target.value })}
              autoComplete="new-password"
              disabled={busy}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-900/5 focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                </button>
              }
            />
          </Field>
        ) : (
          <div className="sm:col-span-2">
            <Switch
              checked={draft.active}
              onChange={(v) => set({ active: v })}
              disabled={busy || locked}
              label="Tài khoản đang hoạt động"
              description={draft.active ? "Người dùng đăng nhập và sử dụng bình thường." : "Đã khóa: không đăng nhập được, phiên đang mở bị đăng xuất."}
            />
          </div>
        )}
      </div>
      {guard ? (
        <Notice tone="bad" live>
          {guard}
        </Notice>
      ) : null}
    </form>
  );
}
