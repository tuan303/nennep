import { cn } from "@/components/ui/cn";
import { APP_NAME } from "@/lib/constants";

/** Five-point star path (24×24 box) – decorative "ngôi sao" accent used in backgrounds and empty states. */
export const STAR_PATH = "M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.7l-5.52 2.91 1.05-6.15L3.06 9.1l6.18-.9z";

/** Official NSHM logo colour (logo file supplied by the school). */
export const SCHOOL_RED = "#D21F36";

export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const MARK_BOX: Record<LogoSize, string> = {
  xs: "size-6",
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-16",
};

export interface LogoMarkProps {
  size?: LogoSize;
  className?: string;
  /** Accessible name; omit when the mark sits next to visible text (decorative). */
  label?: string;
}

/**
 * Logo Trường Ngôi Sao Hoàng Mai: red square with the white geometric star (inner square, circle and
 * eight rays) – drawn from the official SVG (72×72) so it stays crisp at every size.
 */
export function LogoMark({ size = "md", className, label }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 72 72"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", MARK_BOX[size], className)}
    >
      <rect width="72" height="72" fill={SCHOOL_RED} />
      <g fill="none" stroke="#fff" strokeWidth="3" strokeMiterlimit="10">
        <rect x="9.407" y="9.357" width="53.296" height="53.294" />
        <circle cx="36.003" cy="36.007" r="18.655" />
        <path d="M36.003 17.794V9.357M49.324 22.678 62.644 9.357M54.208 36H62.645M49.324 49.329l13.32 13.322M36.003 54.213v8.438M22.676 49.329 9.356 62.651M17.792 36H9.356M22.676 22.678 9.356 9.357" />
      </g>
    </svg>
  );
}

export interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** "dark" text for light backgrounds, "light" text for navy/red backgrounds. */
  tone?: "dark" | "light";
  /** false → mark only (the name stays available to screen readers). */
  showText?: boolean;
  className?: string;
}

const WORD: Record<NonNullable<LogoProps["size"]>, { mark: LogoSize; top: string; main: string; gap: string }> = {
  sm: { mark: "sm", top: "text-[8.5px]", main: "text-[15px]", gap: "gap-2" },
  md: { mark: "md", top: "text-[9.5px]", main: "text-[17px]", gap: "gap-2.5" },
  lg: { mark: "lg", top: "text-[11px]", main: "text-[21px]", gap: "gap-3" },
};

/** Logo mark + wordmark "NGÔI SAO HOÀNG MAI / Nền nếp". */
export function Logo({ size = "md", tone = "dark", showText = true, className }: LogoProps) {
  const s = WORD[size];
  return (
    <span className={cn("inline-flex min-w-0 items-center", s.gap, className)}>
      {/* On navy/red surfaces a hairline keeps the red square from melting into the background. */}
      <LogoMark size={s.mark} className={tone === "light" ? "outline outline-1 outline-white/45" : undefined} />
      {showText ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span className={cn("truncate font-semibold uppercase tracking-[0.14em]", s.top, tone === "light" ? "text-white/75" : "text-brand-600")}>
            Ngôi Sao Hoàng Mai
          </span>
          <span className={cn("mt-1 truncate font-bold tracking-tight", s.main, tone === "light" ? "text-white" : "text-brand-900")}>Nền nếp</span>
        </span>
      ) : (
        <span className="sr-only">{APP_NAME}</span>
      )}
    </span>
  );
}
