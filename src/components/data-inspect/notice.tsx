import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn, toneSoft, type Tone } from "@/components/ui";

export interface NoticeProps {
  tone?: Extract<Tone, "brand" | "warn" | "bad" | "ok" | "star">;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons / links under the text. */
  action?: ReactNode;
  /** "alert" for errors the user must notice now; default "note". */
  role?: "alert" | "status" | "note";
  className?: string;
}

const DEFAULT_ICON = { brand: Info, ok: Info, star: Info, warn: TriangleAlert, bad: CircleAlert } as const;

/** Inline callout (explanations, warnings, errors) using the kit's soft tone tokens. */
export function Notice({ tone = "brand", icon, title, children, action, role = "note", className }: NoticeProps) {
  const Icon = icon ?? DEFAULT_ICON[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-control px-3.5 py-3 text-sm leading-relaxed ring-1 ring-inset", toneSoft[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.25} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="min-w-0 text-[13.5px] opacity-95">{children}</div> : null}
        {action ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
