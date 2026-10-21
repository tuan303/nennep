import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right (wrap below the title on mobile). */
  actions?: ReactNode;
  icon?: LucideIcon;
  breadcrumbs?: Breadcrumb[];
  /** Small line above the title, e.g. level + period "THCS · Tuần 12/10 – 18/10/2026". */
  eyebrow?: ReactNode;
  className?: string;
}

/** Page title block. The navy icon tile with a gold star point is the brand signature. */
export function PageHeader({ title, description, actions, icon: Icon, breadcrumbs, eyebrow, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 pb-1 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? <BrandIconTile icon={Icon} /> : null}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav aria-label="Đường dẫn" className="mb-1" data-print-hide>
              <ol className="flex flex-wrap items-center gap-1 text-[13px] text-slate-500">
                {breadcrumbs.map((b, i) => (
                  <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                    {b.href ? (
                      <Link href={b.href} className="rounded hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
                        {b.label}
                      </Link>
                    ) : (
                      <span aria-current={i === breadcrumbs.length - 1 ? "page" : undefined}>{b.label}</span>
                    )}
                    {i < breadcrumbs.length - 1 ? <ChevronRight aria-hidden className="size-3.5 text-slate-400" /> : null}
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          {eyebrow ? <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-acc-ink">{eyebrow}</p> : null}
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-brand-900 sm:text-[26px]">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
        </div>
      </div>
      {actions ? (
        // Not shrink-0: with 2–3 buttons the title column would be squeezed to a few words per line between sm and xl.
        // The box shrinks with the title instead (never below its widest button) and wraps its buttons.
        <div className="flex max-w-full flex-wrap items-center gap-2" data-print-hide>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** Navy gradient square with a white icon and a small gold star – used by PageHeader, EmptyState, login. */
export function BrandIconTile({ icon: Icon, size = "md", className }: { icon: LucideIcon; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "size-9 rounded-[10px]" : size === "lg" ? "size-14 rounded-2xl" : "size-11 rounded-xl";
  const ico = size === "sm" ? "size-[18px]" : size === "lg" ? "size-7" : "size-[22px]";
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 text-white shadow-raised ring-1 ring-inset ring-white/10",
        box,
        className,
      )}
    >
      <Icon className={ico} strokeWidth={2} />
      <StarPoint className="absolute -right-1 -top-1 size-3.5" />
    </span>
  );
}

/** Tiny five-point gold star (decorative). */
export function StarPoint({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("drop-shadow-[0_1px_1px_rgb(11_31_77/0.35)]", className)}>
      <path
        d="M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.7l-5.52 2.91 1.05-6.15L3.06 9.1l6.18-.9z"
        fill="#f5b301"
        stroke="#fff"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  id?: string;
  className?: string;
  children?: ReactNode;
}

/** Titled block inside a page (h2 + description + actions, content below). */
export function Section({ title, description, actions, icon: Icon, id, className, children }: SectionProps) {
  const autoId = useId();
  const headingId = id ? `${id}-title` : `${autoId}-title`;
  return (
    <section id={id} aria-labelledby={title != null ? headingId : undefined} className={cn("flex min-w-0 flex-col gap-3 sm:gap-4", className)}>
      {title != null || actions != null ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? (
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
                <Icon aria-hidden className="size-4" strokeWidth={2.25} />
              </span>
            ) : null}
            <div className="min-w-0">
              {title != null ? (
                <h2 id={headingId} className="text-[17px] font-semibold leading-6 text-brand-900">
                  {title}
                </h2>
              ) : null}
              {description != null ? <p className="text-[13px] leading-5 text-slate-500">{description}</p> : null}
            </div>
          </div>
          {actions != null ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
