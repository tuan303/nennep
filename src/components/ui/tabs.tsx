"use client";

import * as RTabs from "@radix-ui/react-tabs";
import { createContext, useContext, type ComponentPropsWithoutRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { formatNumberVN } from "./format";

type TabsVariant = "underline" | "pill";
const VariantCtx = createContext<TabsVariant>("underline");

export type TabsProps = ComponentPropsWithoutRef<typeof RTabs.Root>;

/** Radix Tabs root: `<Tabs value onValueChange>` or `<Tabs defaultValue>`. */
export function Tabs({ className, ...rest }: TabsProps) {
  return <RTabs.Root className={cn("flex min-w-0 flex-col gap-4", className)} {...rest} />;
}

export interface TabsListProps extends ComponentPropsWithoutRef<typeof RTabs.List> {
  /** "underline" (page-level sections) or "pill" (compact switch inside a card). */
  variant?: TabsVariant;
}

export function TabsList({ variant = "underline", className, children, ...rest }: TabsListProps) {
  return (
    <VariantCtx.Provider value={variant}>
      <RTabs.List
        className={cn(
          "no-scrollbar flex max-w-full items-center overflow-x-auto",
          variant === "underline" ? "gap-1 border-b border-border" : "w-fit gap-1 rounded-control bg-surface-3 p-1 ring-1 ring-inset ring-border",
          className,
        )}
        {...rest}
      >
        {children}
      </RTabs.List>
    </VariantCtx.Provider>
  );
}

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof RTabs.Trigger> {
  icon?: LucideIcon;
  /** Small counter after the label (e.g. number of items to review). */
  count?: number;
  children?: ReactNode;
}

export function TabsTrigger({ icon: Icon, count, className, children, ...rest }: TabsTriggerProps) {
  const variant = useContext(VariantCtx);
  return (
    <RTabs.Trigger
      className={cn(
        "group relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50",
        variant === "underline"
          ? "h-11 px-3 text-slate-500 hover:text-brand-900 data-[state=active]:text-acc-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-acc after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100"
          : "h-9 rounded-lg px-3 text-slate-600 hover:text-brand-900 pointer-coarse:h-10 data-[state=active]:bg-surface data-[state=active]:text-brand-900 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border",
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden className="size-4" strokeWidth={2.25} /> : null}
      {children}
      {count != null ? (
        <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-soft px-1.5 text-2xs font-bold text-muted-strong group-data-[state=active]:bg-brand-600 group-data-[state=active]:text-white">
          {formatNumberVN(count)}
        </span>
      ) : null}
    </RTabs.Trigger>
  );
}

export function TabsContent({ className, ...rest }: ComponentPropsWithoutRef<typeof RTabs.Content>) {
  return (
    <RTabs.Content
      className={cn("min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 data-[state=active]:animate-fade-in", className)}
      {...rest}
    />
  );
}
