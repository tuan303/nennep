"use client";
import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn, toneSoft, type Tone } from "@/components/ui";

export interface NoticeProps {
  tone?: Extract<Tone, "brand" | "warn" | "bad" | "ok" | "star">;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons on the right (below on phones). */
  action?: ReactNode;
  className?: string;
  /** role="alert" for errors that appear after an action. */
  live?: boolean;
}

const DEFAULT_ICON: Record<NonNullable<NoticeProps["tone"]>, LucideIcon> = {
  brand: Info,
  star: Info,
  ok: Info,
  warn: TriangleAlert,
  bad: CircleAlert,
};

/** Inline explanation / warning box built from the kit tone palette (icon + text, never colour alone). */
export function Notice({ tone = "brand", icon, title, children, action, className, live }: NoticeProps) {
  const Icon = icon ?? DEFAULT_ICON[tone];
  return (
    <div role={live ? "alert" : undefined} className={cn("@container rounded-control px-3.5 py-3 ring-1 ring-inset", toneSoft[tone], className)}>
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.25} />
          <div className="min-w-0 text-[13.5px] leading-relaxed">
            {title ? <p className="font-semibold">{title}</p> : null}
            {children ? <div className={cn(title ? "mt-0.5 opacity-90" : undefined)}>{children}</div> : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 @lg:justify-end @lg:pl-0">{action}</div> : null}
      </div>
    </div>
  );
}

/** List of server validation messages (when they do not map to a field). */
export function ServerErrors({ messages, className }: { messages: readonly string[]; className?: string }) {
  if (messages.length === 0) return null;
  return (
    <Notice tone="bad" live title="Máy chủ chưa chấp nhận thay đổi" className={className}>
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul className="list-disc pl-4">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Notice>
  );
}

/** Small red message under an inline (table cell) editor. */
export function CellError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium leading-4 text-bad-strong">{message}</p>;
}
