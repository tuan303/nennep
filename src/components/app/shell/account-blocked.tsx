"use client";
import { useState } from "react";
import { LogOut, ShieldX } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { errorMessage } from "@/lib/client/api-errors";
import { useSession } from "@/lib/client/session";
import { StatusScreen } from "./status-screen";

const DEFAULT_REASON = "Tài khoản chưa được cấp quyền sử dụng hệ thống. Vui lòng liên hệ quản trị viên của trường.";

/**
 * Body for a signed-in Firebase account without an app profile (403) or a deactivated profile:
 * reason from the server, the email in use and a "sign in with another account" button.
 */
export function AccountBlocked({ className }: { className?: string }) {
  const { email, error, logout } = useSession();
  const [busy, setBusy] = useState(false);

  async function switchAccount() {
    setBusy(true);
    try {
      await logout();
    } catch (err) {
      toast.error(errorMessage(err, "Không đăng xuất được. Vui lòng thử lại."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <div role="alert" className="flex items-start gap-3 rounded-control bg-warn-soft px-3.5 py-3 text-sm leading-relaxed text-warn-strong ring-1 ring-inset ring-warn/25">
        <ShieldX aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.25} />
        <p>{error || DEFAULT_REASON}</p>
      </div>
      {email ? (
        <p className="mt-4 text-sm text-slate-600">
          Đang đăng nhập bằng <span className="font-semibold text-brand-900 [overflow-wrap:anywhere]">{email}</span>
        </p>
      ) : null}
      <Button variant="secondary" size="lg" block icon={LogOut} loading={busy} onClick={() => void switchAccount()} className="mt-5">
        Đăng nhập bằng tài khoản khác
      </Button>
    </div>
  );
}

/** Full-page variant shown by the app guard. */
export function AccountBlockedScreen() {
  return (
    <StatusScreen
      icon={ShieldX}
      tone="warn"
      title="Tài khoản chưa được cấp quyền"
      description="Bạn đã đăng nhập thành công nhưng tài khoản chưa được phân quyền trong hệ thống nền nếp."
      home={null}
    >
      <AccountBlocked className="mt-6 text-left" />
    </StatusScreen>
  );
}
