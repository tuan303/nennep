import { cn } from "@/components/ui/cn";
import { GUTTER_X } from "@/components/app/shell/layout-classes";

/** Page column of the guide: same gutters as the app shell, narrower than the dashboards (reading width). */
export const GUIDE_WRAP = cn("mx-auto w-full max-w-[1240px]", GUTTER_X);

// Anchors land below the sticky top bar thanks to the global `html { scroll-padding-top: 5rem }` (globals.css):
// do not add scroll-margin on top of it.
