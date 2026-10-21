"use client";
import Link from "next/link";
import { useState } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import { cn } from "@/components/ui";
import { MoreSheet } from "./more-sheet";
import { activeNavItem, type BottomSlot } from "./nav-config";
import { useShellContext } from "./shell-context";
import { useNavModel } from "./use-nav";

const TAB =
  "relative flex h-full min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold leading-none outline-none transition-colors focus-visible:bg-brand-50";

function Tab({ slot, active }: { slot: BottomSlot; active: boolean }) {
  const { item } = slot;
  const Icon = item.icon;
  if (slot.emphasized) {
    return (
      <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(TAB, "group")}>
        {/* 22px spacer keeps the label aligned with the other tabs; the gold button floats above the bar. */}
        <span aria-hidden className="relative size-[22px]">
          <span
            className={cn(
              "absolute -top-[34px] left-1/2 inline-flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-star-500 text-brand-950 shadow-gold ring-4 ring-surface transition-transform group-active:scale-95",
              active && "bg-star-400",
            )}
          >
            <Plus className="size-7" strokeWidth={2.75} />
          </span>
        </span>
        <span className={active ? "text-brand-800" : "text-slate-600"}>{item.shortLabel}</span>
      </Link>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(TAB, active ? "text-brand-700" : "text-slate-500 hover:text-brand-800")}>
      {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand-600" /> : null}
      <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
      <span className="max-w-full truncate px-0.5">{item.shortLabel}</span>
    </Link>
  );
}

/** Phone tab bar (< 768px): Tổng quan · Xếp hạng · (+) Nhập · Học sinh · Thêm. */
export function BottomNav() {
  const { bottom, pathname } = useNavModel();
  const { badges } = useShellContext();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems = bottom.more.flatMap((g) => g.items);
  const active = activeNavItem([...bottom.slots.map((s) => s.item), ...moreItems], pathname);
  const moreActive = !!active && moreItems.some((i) => i.id === active.id);
  const moreBadge = moreItems.some((i) => badges[i.href] !== undefined);

  return (
    <>
      <nav
        aria-label="Điều hướng nhanh"
        data-print-hide
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(11_31_77/0.12)] backdrop-blur md:hidden"
      >
        <ul className="grid h-16 grid-cols-5 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          {bottom.slots.map((slot) => (
            <li key={slot.item.id} className="min-w-0">
              <Tab slot={slot} active={active?.id === slot.item.id} />
            </li>
          ))}
          {Array.from({ length: Math.max(0, 4 - bottom.slots.length) }, (_, i) => (
            <li key={`empty-${i}`} aria-hidden />
          ))}
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(TAB, "w-full", moreActive ? "text-brand-700" : "text-slate-500 hover:text-brand-800")}
            >
              {moreActive ? <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand-600" /> : null}
              <span className="relative">
                <LayoutGrid aria-hidden className="size-[22px]" strokeWidth={moreActive ? 2.4 : 2} />
                {moreBadge ? <span aria-hidden className="absolute -right-1 -top-0.5 size-2 rounded-full bg-star-500 ring-2 ring-surface" /> : null}
              </span>
              <span>Thêm</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} groups={bottom.more} activeId={active?.id} />
    </>
  );
}
