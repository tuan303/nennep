import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { toneDot, toneOutline, toneSoft, toneSolid, type Tone } from "./tones";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: "sm" | "md";
  variant?: "soft" | "solid" | "outline";
  icon?: LucideIcon;
  iconClassName?: string;
  /** Leading status dot instead of an icon. */
  dot?: boolean;
  children?: ReactNode;
}

const SIZE = {
  sm: "h-5 gap-1 px-1.5 text-2xs [&_svg]:size-3",
  md: "h-6 gap-1.5 px-2 text-xs [&_svg]:size-3.5",
};

/** Compact label. Status meaning must also be in the text (never colour alone). */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "muted", size = "md", variant = "soft", icon: Icon, iconClassName, dot, className, children, ...rest },
  ref,
) {
  const palette = variant === "solid" ? toneSolid : variant === "outline" ? toneOutline : toneSoft;
  return (
    <span
      ref={ref}
      className={cn(
        "num inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full font-semibold leading-none ring-1 ring-inset",
        palette[tone],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden className={cn("size-1.5 rounded-full", variant === "solid" ? "bg-current" : toneDot[tone])} /> : null}
      {Icon ? <Icon aria-hidden strokeWidth={2.5} className={cn("shrink-0", iconClassName)} /> : null}
      {children != null ? <span className="truncate">{children}</span> : null}
    </span>
  );
});

export interface PillProps extends Omit<HTMLAttributes<HTMLElement>, "onClick"> {
  tone?: Tone;
  icon?: LucideIcon;
  /** Selected state for toggle pills (renders a pressed button when `onClick` is set). */
  active?: boolean;
  onClick?: () => void;
  /** Shows an × button. */
  onRemove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  children?: ReactNode;
}

/**
 * Rounded chip for filters and selections: static, toggle (`onClick` + `active`) or removable (`onRemove`).
 * Removable pills render the × as a separate button so both are keyboard reachable.
 */
export function Pill({ tone = "brand", icon: Icon, active, onClick, onRemove, removeLabel, disabled, className, children, ...rest }: PillProps) {
  const body = (
    <>
      {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} /> : null}
      <span className="truncate">{children}</span>
    </>
  );
  const shell = cn(
    "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full text-[13px] font-medium ring-1 ring-inset transition-colors duration-150",
    active ? toneSolid[tone] : "bg-surface text-slate-700 ring-border-strong",
    disabled && "opacity-50",
    className,
  );
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(shell, "px-3 pointer-coarse:h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", !active && "hover:bg-surface-2 hover:ring-brand-300")}
        {...rest}
      >
        {body}
      </button>
    );
  }
  return (
    <span className={cn(shell, onRemove ? "pl-3 pr-1" : "px-3", !active && onRemove && "bg-brand-50 text-brand-800 ring-brand-200")} {...rest}>
      {body}
      {onRemove ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={removeLabel ?? `Bỏ ${typeof children === "string" ? children : "mục này"}`}
          className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-current opacity-70 transition hover:bg-slate-900/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500 before:absolute before:-inset-2 before:content-['']"
        >
          <X aria-hidden className="size-3.5" strokeWidth={2.5} />
        </button>
      ) : null}
    </span>
  );
}
