"use client";
import Link from "next/link";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip, cn } from "@/components/ui";
import { SCHOOL_NAME } from "@/lib/constants";
import { Logo, LogoMark } from "./logo";
import { activeNavItem, type NavItem } from "./nav-config";
import { useShellContext, type NavBadgeValue } from "./shell-context";
import { useNavModel } from "./use-nav";

const STORAGE_KEY = "nshm.sidebar";

function readCollapsed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // storage unavailable: preference not remembered
  }
}

function NavLink({ item, active, compact, badge }: { item: NavItem; active: boolean; compact: boolean; badge?: NavBadgeValue }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? (badge !== undefined ? `${item.title} (${badge})` : item.title) : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[14px] font-medium outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-star-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900",
        active ? "bg-white/[0.12] text-white" : "text-white/75 hover:bg-white/[0.06] hover:text-white",
        compact && "justify-center px-0",
      )}
    >
      {active ? <span aria-hidden className="absolute -left-3 top-2 h-6 w-1 rounded-r-full bg-star-400" /> : null}
      <span className="relative">
        <Icon aria-hidden className={cn("size-[19px] shrink-0", active ? "text-star-400" : "text-white/60 group-hover:text-white")} strokeWidth={2} />
        {compact && badge !== undefined ? <span aria-hidden className="absolute -right-1.5 -top-1 size-2 rounded-full bg-star-400 ring-2 ring-brand-900" /> : null}
      </span>
      {!compact ? <span className="min-w-0 flex-1 truncate">{item.title}</span> : null}
      {!compact && badge !== undefined ? (
        <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-star-500 px-1.5 text-2xs font-bold text-brand-950">{badge}</span>
      ) : null}
    </Link>
  );
  if (!compact) return link;
  return (
    <Tooltip content={item.title} side="right">
      {link}
    </Tooltip>
  );
}

/**
 * Navy sidebar: icon rail on tablets (768–1023px), full width on desktops with a collapse toggle
 * (remembered per device). Items are filtered by permission; active item gets a gold marker.
 */
export function Sidebar() {
  const { groups, pathname } = useNavModel();
  const { badges } = useShellContext();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    writeCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };
  const active = activeNavItem(
    groups.flatMap((g) => g.items),
    pathname,
  );

  const renderNav = (compact: boolean) => (
    <nav aria-label="Điều hướng chính" className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4 pt-2">
      {groups.map((g, gi) => (
        <div key={g.id} className={cn(gi > 0 && "mt-5")}>
          {compact ? (
            gi > 0 ? <div aria-hidden className="mx-3 mb-3 h-px bg-white/10" /> : null
          ) : (
            <p className="mb-1.5 px-2.5 text-2xs font-bold uppercase tracking-[0.14em] text-white/60">{g.label}</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => (
              <li key={it.id}>
                <NavLink item={it} active={active?.id === it.id} compact={compact} badge={badges[it.href]} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const shell = "sticky top-0 h-dvh shrink-0 flex-col bg-brand-900 text-white shadow-[inset_-1px_0_0_rgb(255_255_255/0.06)]";
  const header = (compact: boolean) => (
    <div className={cn("flex h-16 shrink-0 items-center", compact ? "justify-center" : "px-5")}>
      <Link href="/" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-star-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900">
        {compact ? <LogoMark label="NSHM Nền nếp – Tổng quan" /> : <Logo tone="light" />}
      </Link>
    </div>
  );

  return (
    <>
      {/* Tablets: icon rail */}
      <aside data-print-hide aria-label="Thanh điều hướng" className={cn(shell, "box-content hidden w-[76px] pl-[env(safe-area-inset-left)] md:flex lg:hidden")}>
        {header(true)}
        {renderNav(true)}
      </aside>
      {/* Desktops: full or collapsed */}
      <aside
        data-print-hide
        aria-label="Thanh điều hướng"
        className={cn(shell, "hidden transition-[width] duration-200 ease-soft lg:flex", collapsed ? "w-[76px]" : "w-[264px]")}
      >
        {header(collapsed)}
        {renderNav(collapsed)}
        <div className={cn("shrink-0 border-t border-white/10 p-3", collapsed && "flex justify-center")}>
          {!collapsed ? <p className="mb-2 truncate px-2.5 text-2xs text-white/60">{SCHOOL_NAME}</p> : null}
          <Tooltip content="Mở rộng thanh bên" side="right" disabled={!collapsed}>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
              className={cn(
                "flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-star-400",
                collapsed ? "w-10 justify-center px-0" : "w-full",
              )}
            >
              {collapsed ? <PanelLeftOpen aria-hidden className="size-[18px]" /> : <PanelLeftClose aria-hidden className="size-[18px]" />}
              {!collapsed ? <span>Thu gọn</span> : null}
            </button>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
