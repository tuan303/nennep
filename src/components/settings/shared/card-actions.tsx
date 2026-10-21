"use client";
import type { ReactNode } from "react";

/**
 * Wrapper for several buttons in a Card header. Works around the kit CardHeader actions box (`shrink-0`, no
 * max width), which otherwise keeps wide button rows on one line and overflows 375px phones.
 */
export function CardActions({ children }: { children: ReactNode }) {
  return <div className="flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-2">{children}</div>;
}
