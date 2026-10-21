import type { ReactNode } from "react";
import { AppShell } from "@/components/app/shell/app-shell";
import { routeMetadata } from "@/components/app/shell/routes";

/** Default title for "/" (each other route segment sets its own in its layout.tsx). */
export const metadata = routeMetadata("overview");

/** Signed-in area: client guard + sidebar / top bar / bottom tab bar around every page. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
