import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KitShowcase } from "./_parts/kit-showcase";

export const metadata: Metadata = {
  title: "Bộ giao diện · NSHM Nền nếp",
  robots: { index: false, follow: false },
};

/** Dev-only showcase of the UI kit and charts (visual QA). 404 in production builds. */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitShowcase />;
}
