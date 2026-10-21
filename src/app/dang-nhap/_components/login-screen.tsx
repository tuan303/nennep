"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, ShieldX } from "lucide-react";
import { AccountBlocked } from "@/components/app/shell/account-blocked";
import { Badge, Button, Spinner } from "@/components/ui";
import { USE_EMULATORS } from "@/lib/client/firebase-core";
import { useSession } from "@/lib/client/session";
import { LoginForm } from "./login-form";
import { LoginLayout } from "./login-layout";
import { safeNextPath } from "./safe-next";

function nextFromLocation(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

function Progress({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center py-6 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
        <Spinner size="md" label="" />
      </span>
      <p className="mt-4 text-base font-semibold text-brand-900">{title}</p>
      {detail ? <p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{detail}</p> : null}
      {children}
    </div>
  );
}

/** Profile keeps failing to load (offline / server error): show the retry message and a way out. */
function Checking({ email, error }: { email?: string; error?: string }) {
  const { logout } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Progress title="Đang tải thông tin tài khoản…" detail={email}>
      {error ? (
        <>
          <p role="alert" className="mt-4 rounded-control bg-warn-soft px-3.5 py-2.5 text-sm text-warn-strong ring-1 ring-inset ring-warn/25">
            {error}
          </p>
          <Button
            variant="ghost"
            size="sm"
            icon={LogOut}
            loading={busy}
            className="mt-3"
            onClick={() => {
              setBusy(true);
              void logout().finally(() => setBusy(false));
            }}
          >
            Dùng tài khoản khác
          </Button>
        </>
      ) : null}
    </Progress>
  );
}

/**
 * /dang-nhap: sign-in form; once signed in → redirect to ?next= (sanitised) or "/".
 * Accounts without permission see the "forbidden" panel with a sign-out button.
 * The form is server-rendered so it is usable before Firebase finishes restoring a session.
 */
export function LoginScreen() {
  const { status, email, error } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "signedIn") router.replace(nextFromLocation());
  }, [status, router]);

  let panel: ReactNode;
  if (status === "signedIn") {
    panel = <Progress title="Đăng nhập thành công" detail="Đang chuyển vào hệ thống…" />;
  } else if (status === "forbidden") {
    panel = (
      <>
        <div className="mb-5 flex items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn-strong ring-1 ring-inset ring-warn/20">
            <ShieldX aria-hidden className="size-[22px]" strokeWidth={2} />
          </span>
          <h1 className="text-xl font-bold leading-tight text-brand-900">Tài khoản chưa được cấp quyền</h1>
        </div>
        <AccountBlocked />
      </>
    );
  } else if (status === "loading" && email) {
    panel = <Checking email={email} error={error} />;
  } else {
    panel = <LoginForm notice={status === "signedOut" ? error : undefined} />;
  }

  return (
    <LoginLayout
      footer={
        <>
          <p>Tài khoản do nhà trường cấp. Hệ thống không hỗ trợ tự đăng ký.</p>
          {USE_EMULATORS ? (
            <Badge tone="star" size="sm" className="mt-2">
              Môi trường thử nghiệm (emulator)
            </Badge>
          ) : null}
        </>
      }
    >
      {panel}
    </LoginLayout>
  );
}
