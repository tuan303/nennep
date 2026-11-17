"use client";
import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn, toneSoft } from "@/components/ui";

export interface MailNoticeProps {
  tone?: "brand" | "warn" | "bad";
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons / links (below the text). */
  action?: ReactNode;
  /** role="alert" for a problem that appears after an action. */
  live?: boolean;
  className?: string;
}

const ICONS: Record<NonNullable<MailNoticeProps["tone"]>, LucideIcon> = { brand: Info, warn: TriangleAlert, bad: CircleAlert };

/** Inline message box of the send dialog (icon + text, never colour alone). */
export function MailNotice({ tone = "brand", title, children, action, live, className }: MailNoticeProps) {
  const Icon = ICONS[tone];
  return (
    <div role={live ? "alert" : undefined} className={cn("rounded-control px-3.5 py-3 ring-1 ring-inset", toneSoft[tone], className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.25} />
        <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn("break-words", title ? "mt-0.5 opacity-90" : undefined)}>{children}</div> : null}
          {action ? <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
