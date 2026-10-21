import type { Metadata } from "next";
import { InShellNotFound } from "@/components/app/shell/in-shell-not-found";

export const metadata: Metadata = { title: "Không tìm thấy" };

/** `notFound()` called by a page inside the app shell. */
export default function AppNotFound() {
  return <InShellNotFound />;
}
