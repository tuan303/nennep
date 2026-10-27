"use client";
import Link from "next/link";
import * as DM from "@radix-ui/react-dropdown-menu";
import { BookMarked, Check } from "lucide-react";
import { IconButton, Tooltip, cn } from "@/components/ui";
import { REGULATION_NAV_ITEMS } from "./nav-config";
import { isRouteActive } from "./routes";

/** Neutral look (not the level accent): grey text, a soft grey chip for the page being read. */
const LINK =
  "inline-flex h-9 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:h-11 pointer-coarse:min-w-11 [&_svg]:size-4";
const LINK_IDLE = "text-slate-600 hover:bg-slate-900/[0.04] hover:text-brand-900";
const LINK_ACTIVE = "bg-slate-900/[0.06] text-brand-900 ring-1 ring-inset ring-border-strong";

/**
 * "Quy chế khen thưởng" · "Quy chế kỷ luật" in the top bar from 1024px, for every signed-in user. The labels follow
 * the free width of the bar (container query on the bar, which also depends on the sidebar being collapsed): icons
 * only, then the short label ("Khen thưởng"), then the full title – the accessible name is always the full title.
 */
export function RegulationLinks({ pathname, className }: { pathname: string; className?: string }) {
  return (
    <nav aria-label="Quy chế của trường" className={cn("items-center gap-0.5", className)}>
      {REGULATION_NAV_ITEMS.map((it) => {
        const active = isRouteActive(it.href, pathname);
        const Icon = it.icon;
        return (
          <Tooltip key={it.id} content={it.title}>
            <Link href={it.href} aria-label={it.title} aria-current={active ? "page" : undefined} className={cn(LINK, active ? LINK_ACTIVE : LINK_IDLE)}>
              <Icon aria-hidden strokeWidth={2.25} />
              <span className="hidden @min-[860px]:inline @min-[1000px]:hidden">{it.shortLabel}</span>
              <span className="hidden @min-[1000px]:inline">{it.title}</span>
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}

const ITEM =
  "flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 outline-none transition-colors pointer-coarse:h-11 data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-900 [&_svg]:size-[18px] [&_svg]:text-slate-500 data-[highlighted]:[&_svg]:text-brand-600";

/** One "Quy chế" icon button with a small menu of the two (top bar below 1024px; phones also have the "Thêm" tiles). */
export function RegulationMenu({ pathname, className }: { pathname: string; className?: string }) {
  const onRegulation = REGULATION_NAV_ITEMS.some((it) => isRouteActive(it.href, pathname));
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>
        <IconButton icon={BookMarked} label="Quy chế" className={cn("rounded-full", onRegulation && LINK_ACTIVE, className)} />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] w-[min(280px,calc(100vw-24px))] rounded-xl border border-border bg-surface p-1.5 shadow-pop outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in"
        >
          <DM.Label className="px-2.5 pb-1.5 pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-slate-500">Quy chế của trường</DM.Label>
          {REGULATION_NAV_ITEMS.map((it) => {
            const active = isRouteActive(it.href, pathname);
            const Icon = it.icon;
            return (
              <DM.Item key={it.id} asChild className={cn(ITEM, active && "font-semibold text-brand-900")}>
                <Link href={it.href} aria-current={active ? "page" : undefined}>
                  <Icon aria-hidden strokeWidth={2.25} />
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  {active ? <Check aria-hidden strokeWidth={2.5} /> : null}
                </Link>
              </DM.Item>
            );
          })}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
