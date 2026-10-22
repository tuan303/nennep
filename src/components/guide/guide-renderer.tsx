"use client";
import { GUIDE } from "@/components/guide/content";
import { GuideView } from "./guide-view";

/** /huong-dan: renders the guide content (src/components/guide/content) – public, no sign-in or dataset needed. */
export function GuideRenderer() {
  return <GuideView content={GUIDE} />;
}
