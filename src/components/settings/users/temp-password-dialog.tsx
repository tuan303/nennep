"use client";
import { ClipboardCopy, KeyRound } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { copyWithFallback } from "@/components/app/widgets";
import { credentialText } from "../lib/users";
import { CopyField } from "../shared/copy-field";
import { Notice } from "../shared/notice";

export interface TempCredential {
  email: string;
  displayName: string;
  password: string;
  kind: "create" | "reset";
}

/** Shows a temporary password exactly once, with copy buttons and a hand-over warning. */
export function TempPasswordDialog({ credential, onClose }: { credential: TempCredential | null; onClose: () => void }) {
  async function copyAll() {
    if (!credential) return;
    await copyWithFallback(credentialText(credential.email, credential.password, window.location.origin), {
      success: "Đã sao chép thông tin đăng nhập",
      title: "Sao chép thông tin đăng nhập",
    });
  }
  return (
    <Dialog
      open={credential !== null}
      onOpenChange={(o) => !o && onClose()}
      dismissible={false}
      icon={KeyRound}
      title={credential?.kind === "reset" ? "Mật khẩu tạm mới" : "Tài khoản đã được tạo"}
      description={credential ? `${credential.displayName} · ${credential.email}` : undefined}
      footer={
        <>
          <Button variant="secondary" icon={ClipboardCopy} onClick={() => void copyAll()}>
            Sao chép cả thông tin
          </Button>
          <Button onClick={onClose}>Tôi đã lưu, đóng</Button>
        </>
      }
    >
      {credential ? (
        <div className="flex flex-col gap-4">
          <Notice tone="warn" title="Mật khẩu chỉ hiển thị một lần">
            Hãy chuyển trực tiếp cho người dùng qua kênh riêng (gặp trực tiếp hoặc tin nhắn cá nhân), không gửi vào nhóm chung. Người dùng nên đổi mật khẩu ngay
            sau lần đăng nhập đầu tiên.
          </Notice>
          <CopyField label="Email đăng nhập" value={credential.email} emphasis={false} />
          <CopyField label="Mật khẩu tạm" value={credential.password} />
        </div>
      ) : null}
    </Dialog>
  );
}
