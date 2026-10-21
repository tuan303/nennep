"use client";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, CircleAlert, Eye, EyeOff, Info, Lock, Mail } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { errorMessage } from "@/lib/client/api-errors";
import { enabledAuthProviders } from "@/lib/client/firebase-core";
import { isSilentAuthError, useSession, type AuthProviderId } from "@/lib/client/session";
import { ProviderButtons } from "./provider-buttons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function enabledProviders(): AuthProviderId[] {
  const p = enabledAuthProviders();
  return (["google", "microsoft"] as const).filter((id) => p[id]);
}

/** Email + password form with show/hide, Caps Lock hint, optional social sign-in and Vietnamese errors. */
export function LoginForm({ notice }: { notice?: string }) {
  const { login, loginWithProvider } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [providerBusy, setProviderBusy] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busy = submitting || providerBusy !== null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = email.trim();
    const errs: { email?: string; password?: string } = {};
    if (!value) errs.email = "Vui lòng nhập email.";
    else if (!EMAIL_RE.test(value)) errs.email = "Email chưa đúng định dạng, ví dụ: ten@hoangmaistarschool.edu.vn";
    if (!password) errs.password = "Vui lòng nhập mật khẩu.";
    setFieldError(errs);
    setError(undefined);
    if (errs.email) return emailRef.current?.focus();
    if (errs.password) return passwordRef.current?.focus();

    setSubmitting(true);
    try {
      await login(value, password);
      // Success: the session switches to loading the profile and this form unmounts.
    } catch (err) {
      setError(errorMessage(err, "Đăng nhập không thành công. Vui lòng thử lại."));
      setSubmitting(false);
      passwordRef.current?.select();
    }
  }

  async function onProvider(provider: AuthProviderId) {
    if (busy) return;
    setError(undefined);
    setProviderBusy(provider);
    try {
      await loginWithProvider(provider);
    } catch (err) {
      if (!isSilentAuthError(err)) setError(errorMessage(err, "Đăng nhập không thành công. Vui lòng thử lại."));
    } finally {
      setProviderBusy(null);
    }
  }

  const onPasswordKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold leading-tight text-brand-900">Đăng nhập</h1>
        <p className="mt-1 text-sm text-slate-600">Dùng tài khoản do nhà trường cấp để tiếp tục.</p>
      </div>

      {notice && !error ? (
        <p role="status" className="mb-5 flex items-start gap-2.5 rounded-control bg-brand-50 px-3.5 py-3 text-sm leading-relaxed text-brand-800 ring-1 ring-inset ring-brand-600/15">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
          <span>{notice}</span>
        </p>
      ) : null}

      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" aria-describedby={error ? "login-error" : undefined}>
        <Field label="Email" error={fieldError.email}>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ten@hoangmaistarschool.edu.vn"
            icon={Mail}
            size="lg"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError((f) => ({ ...f, email: undefined }));
            }}
          />
        </Field>
        <Field
          label="Mật khẩu"
          error={fieldError.password}
          hint={capsLock ? <span className="font-medium text-warn-strong">Caps Lock đang bật.</span> : undefined}
        >
          <Input
            ref={passwordRef}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            icon={Lock}
            size="lg"
            value={password}
            onKeyDown={onPasswordKey}
            onKeyUp={onPasswordKey}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldError((f) => ({ ...f, password: undefined }));
            }}
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:size-10"
              >
                {showPassword ? <EyeOff aria-hidden className="size-[18px]" strokeWidth={2.25} /> : <Eye aria-hidden className="size-[18px]" strokeWidth={2.25} />}
              </button>
            }
          />
        </Field>

        {error ? (
          <p id="login-error" role="alert" className="flex items-start gap-2.5 rounded-control bg-bad-soft px-3.5 py-3 text-sm leading-relaxed text-bad-strong ring-1 ring-inset ring-bad/20">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            <span>{error}</span>
          </p>
        ) : null}

        <Button type="submit" size="lg" block loading={submitting} disabled={providerBusy !== null} iconRight={ArrowRight} className="mt-1">
          Đăng nhập
        </Button>
      </form>

      <ProviderButtons providers={enabledProviders()} busy={providerBusy} disabled={submitting} onSelect={(p) => void onProvider(p)} />

      <p className="mt-6 border-t border-border pt-5 text-center text-[13px] text-slate-600">
        Quên mật khẩu? <span className="font-semibold text-brand-700">Liên hệ quản trị viên</span> để được cấp lại.
      </p>
    </>
  );
}
