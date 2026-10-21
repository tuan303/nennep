"use client";
import Link from "next/link";
import { useState } from "react";
import { KeyRound, LayoutGrid, LogOut } from "lucide-react";
import { Avatar, Button, Sheet, cn } from "@/components/ui";
import { useSession } from "@/lib/client/session";
import { ROLE_LABELS } from "@/lib/constants";
import { ChangePasswordDialog } from "./change-password-dialog";
import type { NavGroup } from "./nav-config";
import type { AppRouteId } from "./routes";
import { useShellContext } from "./shell-context";
import { useSignOut } from "./use-nav";
import { profileScopeText } from "./user-menu";

export interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Permitted items that are not in the tab bar. */
  groups: NavGroup[];
  activeId?: AppRouteId;
}

/** "Thêm" bottom sheet on phones: remaining features as tiles (in sidebar order) + account actions. */
export function MoreSheet({ open, onOpenChange, groups, activeId }: MoreSheetProps) {
  const { profile } = useSession();
  const { badges } = useShellContext();
  const signOut = useSignOut();
  const [pwOpen, setPwOpen] = useState(false);
  const close = () => onOpenChange(false);
  const name = profile ? profile.displayName || profile.email : "";
  const items = groups.flatMap((g) => g.items);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title="Tất cả chức năng" icon={LayoutGrid}>
        <div className="flex flex-col gap-5">
          {items.length === 0 ? <p className="text-sm text-slate-500">Các chức năng của bạn đã có trên thanh điều hướng.</p> : null}
          <ul className="grid grid-cols-3 gap-2">
            {items.map((it) => {
              const Icon = it.icon;
              const active = it.id === activeId;
              const badge = badges[it.href];
              return (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-full min-h-[92px] flex-col items-center justify-center gap-2 rounded-card px-1.5 py-3 text-center text-[12.5px] font-semibold leading-tight ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-brand-500",
                      active ? "bg-brand-50 text-brand-800 ring-brand-300" : "bg-surface-2 text-slate-700 ring-border active:bg-brand-50",
                    )}
                  >
                    <span className={cn("inline-flex size-10 items-center justify-center rounded-xl", active ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600")}>
                      <Icon aria-hidden className="size-5" strokeWidth={2} />
                    </span>
                    <span className="line-clamp-2">{it.title}</span>
                    {badge !== undefined ? (
                      <span className="num absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-star-500 px-1.5 text-2xs font-bold text-brand-950">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          {profile ? (
            <section aria-label="Tài khoản" className="rounded-card bg-surface-2 p-3 ring-1 ring-inset ring-border">
              <div className="flex items-center gap-3">
                <Avatar name={name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-900">{name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {ROLE_LABELS[profile.role]} · {profileScopeText(profile)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={KeyRound} onClick={() => setPwOpen(true)}>
                  Đổi mật khẩu
                </Button>
                <Button
                  variant="secondary"
                  icon={LogOut}
                  className="text-bad-strong"
                  onClick={() => {
                    close();
                    void signOut();
                  }}
                >
                  Đăng xuất
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </Sheet>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}
