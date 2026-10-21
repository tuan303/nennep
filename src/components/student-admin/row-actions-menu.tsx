"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import { useRef } from "react";
import { ArrowLeftRight, ArrowUpFromLine, History, IdCard, LogOut, MoreHorizontal, PencilLine, RotateCcw, type LucideIcon } from "lucide-react";
import { IconButton, cn } from "@/components/ui";
import type { StudentLite } from "@/lib/types";

export type RowAction = "profile" | "history" | "edit" | "transfer" | "withdraw" | "reinstate" | "promote";

const ITEM =
  "flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 outline-none transition-colors pointer-coarse:min-h-11 data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-900 [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-slate-500 data-[highlighted]:[&_svg]:text-brand-600";

const DANGER = "text-bad-strong data-[highlighted]:bg-bad-soft data-[highlighted]:text-bad-strong [&_svg]:text-bad data-[highlighted]:[&_svg]:text-bad";

interface MenuEntry {
  action: RowAction;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
}

/**
 * Menu entries for a student: view/edit always; transfer + withdraw for ACTIVE; restore otherwise; "Chuyển cấp"
 * (same Mã HS, another level) when the user can open another level.
 */
export function rowMenuEntries(student: Pick<StudentLite, "status">, opts: { canPromote?: boolean } = {}): MenuEntry[][] {
  const view: MenuEntry[] = [
    { action: "profile", label: "Xem hồ sơ", icon: IdCard },
    { action: "history", label: "Lịch sử vi phạm", icon: History },
    { action: "edit", label: "Sửa thông tin", icon: PencilLine },
  ];
  const change: MenuEntry[] =
    student.status === "ACTIVE"
      ? [
          { action: "transfer", label: "Chuyển lớp", icon: ArrowLeftRight },
          { action: "withdraw", label: "Chuyển trường đi / Tốt nghiệp", icon: LogOut, danger: true },
        ]
      : [{ action: "reinstate", label: "Khôi phục (đang học)", icon: RotateCcw }];
  if (opts.canPromote) change.push({ action: "promote", label: "Chuyển cấp (giữ Mã HS)", icon: ArrowUpFromLine });
  return [view, change];
}

/**
 * "⋯" menu of a roster row. The chosen action runs after the menu has closed (onCloseAutoFocus),
 * so the dialog it opens keeps the focus.
 */
export function RowActionsMenu({
  student,
  onAction,
  canPromote,
  className,
}: {
  student: StudentLite;
  onAction: (action: RowAction, student: StudentLite) => void;
  canPromote?: boolean;
  className?: string;
}) {
  const pending = useRef<RowAction | null>(null);
  const groups = rowMenuEntries(student, { canPromote });
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>
        <IconButton icon={MoreHorizontal} label={`Thao tác với ${student.name}`} size="sm" className={cn("data-[state=open]:bg-slate-900/[0.06]", className)} data-print-hide />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onCloseAutoFocus={(e) => {
            const action = pending.current;
            if (!action) return;
            pending.current = null;
            e.preventDefault();
            onAction(action, student);
          }}
          className="z-[60] w-[min(270px,calc(100vw-24px))] rounded-xl border border-border bg-surface p-1.5 shadow-pop outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in"
        >
          <DM.Label className="truncate px-2.5 pb-1.5 pt-1 text-xs font-semibold text-slate-500">{student.name}</DM.Label>
          {groups.map((group, gi) => (
            <DM.Group key={gi}>
              {gi > 0 ? <DM.Separator className="-mx-1.5 my-1 h-px bg-border" /> : null}
              {group.map((entry) => (
                <DM.Item
                  key={entry.action}
                  className={cn(ITEM, entry.danger && DANGER)}
                  onSelect={() => {
                    pending.current = entry.action;
                  }}
                >
                  <entry.icon aria-hidden strokeWidth={2.25} />
                  {entry.label}
                </DM.Item>
              ))}
            </DM.Group>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
