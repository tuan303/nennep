"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { Avatar, Badge, cn } from "@/components/ui";
import { getClientAuth } from "@/lib/client/firebase-core";
import { useSession } from "@/lib/client/session";
import { LEVELS, ROLE_LABELS } from "@/lib/constants";
import type { UserProfile } from "@/lib/types";
import { ChangePasswordDialog } from "./change-password-dialog";
import { useSignOut } from "./use-nav";

/** "Tất cả cấp học" / "THCS, THPT" / GVCN: "Chủ nhiệm 6A01, 7A02". */
export function profileScopeText(profile: Pick<UserProfile, "role" | "levels" | "gvcnClasses">): string {
  if (profile.role === "GVCN") {
    const classes = profile.gvcnClasses.map((c) => c.classCode);
    return classes.length ? `Chủ nhiệm ${classes.join(", ")}` : "Chưa được gán lớp chủ nhiệm";
  }
  if (profile.levels.length === 0) return "Tất cả cấp học";
  return profile.levels.map((l) => LEVELS[l].short).join(", ");
}

function usesPasswordSignIn(): boolean {
  try {
    const user = getClientAuth().currentUser;
    return !!user?.providerData.some((p) => p.providerId === "password");
  } catch {
    return true;
  }
}

const ITEM =
  "flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 outline-none transition-colors pointer-coarse:h-11 data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-900 [&_svg]:size-[18px] [&_svg]:text-slate-500 data-[highlighted]:[&_svg]:text-brand-600";

/** Avatar button → account card, "Đổi mật khẩu", "Đăng xuất". Name + role are shown next to the avatar from 1024px. */
export function UserMenu({ className }: { className?: string }) {
  const { profile, email } = useSession();
  const signOut = useSignOut();
  const [pwOpen, setPwOpen] = useState(false);
  const [canChangePw, setCanChangePw] = useState(true);
  // "Đổi mật khẩu" chosen: the dialog opens after the menu closed (see onCloseAutoFocus).
  const openingDialog = useRef(false);
  if (!profile) return null;
  const name = profile.displayName || profile.email;
  const role = ROLE_LABELS[profile.role];

  return (
    <>
      <DM.Root modal={false} onOpenChange={(open) => open && setCanChangePw(usesPasswordSignIn())}>
        <DM.Trigger
          className={cn(
            "group inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-full p-0.5 pr-0.5 text-left pointer-coarse:min-w-11 transition-colors hover:bg-slate-900/[0.04] focus-visible:outline-2 focus-visible:outline-brand-500 data-[state=open]:bg-slate-900/[0.05] pointer-coarse:h-11 lg:pr-2",
            className,
          )}
          aria-label={`Tài khoản: ${name}`}
        >
          <Avatar name={name} size="sm" className="ring-0" />
          <span className="hidden min-w-0 flex-col leading-tight lg:flex">
            <span className="max-w-[160px] truncate text-[13px] font-semibold text-brand-900">{name}</span>
            <span className="max-w-[160px] truncate text-2xs text-slate-500">{role}</span>
          </span>
          <ChevronDown aria-hidden className="hidden size-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180 lg:block" strokeWidth={2.25} />
        </DM.Trigger>
        <DM.Portal>
          <DM.Content
            align="end"
            sideOffset={8}
            collisionPadding={12}
            onCloseAutoFocus={(e) => {
              if (!openingDialog.current) return;
              // Open the dialog only once the menu is gone, so the dialog keeps the focus.
              openingDialog.current = false;
              e.preventDefault();
              setPwOpen(true);
            }}
            className="z-[60] w-[min(300px,calc(100vw-24px))] rounded-xl border border-border bg-surface p-1.5 shadow-pop outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in"
          >
            <div className="flex items-start gap-3 px-2.5 pb-3 pt-2">
              <Avatar name={name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-900">{name}</p>
                <p className="truncate text-xs text-slate-500">{email ?? profile.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand" size="sm">
                    {role}
                  </Badge>
                  <Badge tone="muted" size="sm" className="max-w-full">
                    {profileScopeText(profile)}
                  </Badge>
                </div>
              </div>
            </div>
            <DM.Separator className="-mx-1.5 my-1 h-px bg-border" />
            {canChangePw ? (
              <DM.Item
                className={ITEM}
                onSelect={() => {
                  openingDialog.current = true;
                }}
              >
                <KeyRound aria-hidden strokeWidth={2.25} />
                Đổi mật khẩu
              </DM.Item>
            ) : null}
            <DM.Item
              className={cn(ITEM, "text-bad-strong data-[highlighted]:bg-bad-soft data-[highlighted]:text-bad-strong [&_svg]:text-bad data-[highlighted]:[&_svg]:text-bad")}
              onSelect={() => void signOut()}
            >
              <LogOut aria-hidden strokeWidth={2.25} />
              Đăng xuất
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}
