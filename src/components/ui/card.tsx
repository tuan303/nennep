import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export interface CardProps extends DivProps {
  /** Header title (renders CardHeader automatically when title/subtitle/actions are set). */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right side of the header (buttons, segmented control…). */
  actions?: ReactNode;
  /** Small icon before the title. */
  icon?: LucideIcon;
  /** Footer row (muted background). */
  footer?: ReactNode;
  /** Body padding. "none" for edge-to-edge content (tables, charts with own padding). */
  padding?: "none" | "sm" | "md";
  /** Hover lift (use for clickable cards; wrap in a link/button yourself). */
  interactive?: boolean;
  /** Heading level for the title (default h3). */
  headingLevel?: 2 | 3 | 4;
}

const PAD = { none: "", sm: "p-3 sm:p-4", md: "p-4 sm:p-5" };

/** White card on the canvas. Use `title/subtitle/actions/footer` or compose CardHeader/CardBody/CardFooter. */
export function Card({
  title,
  subtitle,
  actions,
  icon,
  footer,
  padding = "md",
  interactive,
  headingLevel = 3,
  className,
  children,
  ...rest
}: CardProps) {
  const hasHeader = title != null || subtitle != null || actions != null;
  return (
    <div
      className={cn(
        "card relative flex min-w-0 flex-col",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-200 ease-soft hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised",
        className,
      )}
      {...rest}
    >
      {hasHeader ? <CardHeader title={title} subtitle={subtitle} actions={actions} icon={icon} headingLevel={headingLevel} /> : null}
      {children != null ? <div className={cn("min-w-0 flex-1", PAD[padding], hasHeader && padding !== "none" && "pt-0 sm:pt-0")}>{children}</div> : null}
      {footer != null ? <CardFooter>{footer}</CardFooter> : null}
    </div>
  );
}

export interface CardHeaderProps extends DivProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  headingLevel?: 2 | 3 | 4;
}

export function CardHeader({ title, subtitle, actions, icon: Icon, headingLevel = 3, className, children, ...rest }: CardHeaderProps) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4 sm:px-5 sm:pt-5", className)} {...rest}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon aria-hidden className="size-4" strokeWidth={2.25} />
          </span>
        ) : null}
        <div className="min-w-0">
          {title != null ? <H className="text-[15px] font-semibold leading-6 text-brand-900">{title}</H> : null}
          {subtitle != null ? <p className="text-[13px] leading-5 text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {/* max-w-full: on narrow phones several buttons wrap inside the box instead of overflowing the card. */}
      {actions != null ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      {children}
    </div>
  );
}

export function CardBody({ className, ...rest }: DivProps) {
  return <div className={cn("min-w-0 flex-1 p-4 sm:p-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: DivProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-b-card border-t border-border bg-surface-2 px-4 py-3 text-[13px] text-slate-600 sm:px-5",
        className,
      )}
      {...rest}
    />
  );
}
