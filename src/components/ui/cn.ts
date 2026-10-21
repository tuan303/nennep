import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge that knows the custom tokens declared in globals.css (@theme). */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card", "control"],
      shadow: ["card", "raised", "pop", "gold", "press"],
      text: ["2xs"],
      animate: [
        "fade-in",
        "fade-out",
        "slide-up",
        "scale-in",
        "scale-out",
        "sheet-up",
        "sheet-down",
        "sheet-left",
        "sheet-right",
        "shimmer",
        "pop",
      ],
      ease: ["soft"],
    },
  },
});

/** Compose class names: clsx semantics + Tailwind conflict resolution (last wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
