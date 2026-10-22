import { cn } from "@/components/ui/cn";

/** Author credit at the foot of every page: login, every signed-in page, the user guide and the status screens (404, errors, blocked account). */
export const CREDIT_TEXT = "© Designed & Developed by Tuan™";

export interface CreditLineProps {
  /** "light" for light surfaces (default), "onDark" for the navy sidebar. */
  tone?: "light" | "onDark";
  /** Keep the line on paper (the guide's printout). Default false: hidden when printing. */
  printable?: boolean;
  className?: string;
}

/** Small, muted, centered credit line. */
export function CreditLine({ tone = "light", printable = false, className }: CreditLineProps) {
  return (
    <p
      data-print-hide={printable ? undefined : ""}
      className={cn(
        "text-center text-2xs font-medium tracking-[0.01em]",
        tone === "onDark" ? "text-white/60" : "text-slate-600",
        className,
      )}
    >
      {CREDIT_TEXT}
    </p>
  );
}
