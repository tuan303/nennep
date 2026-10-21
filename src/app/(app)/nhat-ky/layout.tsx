import type { ReactNode } from "react";
import { routeMetadata } from "@/components/app/shell/routes";

export const metadata = routeMetadata("audit");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
