import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold " +
  "transition-[background-color,color,box-shadow,transform,border-color] duration-150 ease-soft " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-press hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "bg-surface text-brand-900 ring-1 ring-inset ring-border-strong shadow-xs hover:bg-surface-2 hover:ring-brand-300 active:bg-surface-3",
  outline: "bg-transparent text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50 active:bg-brand-100",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-900/[0.05] hover:text-brand-900 active:bg-slate-900/[0.08]",
  danger: "bg-surface text-bad-strong ring-1 ring-inset ring-bad/45 hover:bg-bad-soft active:bg-bad-soft",
  gold: "bg-star-500 text-brand-950 shadow-gold hover:bg-star-400 active:bg-star-600",
};

/** Heights: 36/40/48 px; coarse pointers (touch) get ≥44px for sm/md. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px] pointer-coarse:h-11 [&_svg]:size-4",
  md: "h-10 px-4 text-sm pointer-coarse:h-11 [&_svg]:size-[18px]",
  lg: "h-12 px-5 text-[15px] [&_svg]:size-5",
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}

/** Button look for non-button elements (e.g. next/link): `<Link className={buttonClasses({ variant: "secondary" })}>` */
export function buttonClasses({ variant = "primary", size = "md", block, className }: ButtonClassOptions = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, disables the button and sets aria-busy. */
  loading?: boolean;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Trailing icon. */
  iconRight?: LucideIcon;
  /** Full width. */
  block?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon: Icon, iconRight: IconRight, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={size === "lg" ? "md" : "sm"} label="Đang xử lý" />
        </span>
      ) : null}
      <span className={cn("inline-flex items-center justify-center gap-2", loading && "invisible")}>
        {Icon ? <Icon aria-hidden strokeWidth={2.25} /> : null}
        {children}
        {IconRight ? <IconRight aria-hidden strokeWidth={2.25} /> : null}
      </span>
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** Accessible name (required – icon-only buttons have no visible text). */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Small red dot (e.g. unread notifications). */
  badge?: boolean;
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "size-9 pointer-coarse:size-11 [&_svg]:size-4",
  md: "size-10 pointer-coarse:size-11 [&_svg]:size-5",
  lg: "size-12 [&_svg]:size-6",
};

/** Square icon-only button. Always pass `label` (used as aria-label and title). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = "ghost", size = "md", loading, badge, className, disabled, type = "button", title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], ICON_SIZES[size], "px-0", className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : <Icon aria-hidden strokeWidth={2} />}
      {badge ? <span aria-hidden className="absolute right-2 top-2 size-2 rounded-full bg-bad ring-2 ring-surface" /> : null}
    </button>
  );
});
