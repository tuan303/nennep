"use client";

import * as RT from "@radix-ui/react-tooltip";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";

export interface TooltipProps {
  content: ReactNode;
  /** Must be a single element that accepts a ref (native element or forwardRef component). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** ms before opening on hover (default 250). */
  delay?: number;
  /** Render nothing extra when false/empty content. */
  disabled?: boolean;
  className?: string;
}

/**
 * Small dark tooltip (Radix). Opens on hover/focus; on touch screens a tap opens it
 * and a tap elsewhere closes it. Tooltips enhance – never put the only copy of
 * important information here.
 */
export function Tooltip({ content, children, side = "top", align = "center", delay = 250, disabled, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const pointerType = useRef<string>("");
  if (disabled || content == null || content === "") return children;
  return (
    <RT.Provider delayDuration={delay} skipDelayDuration={200}>
      <RT.Root open={open} onOpenChange={setOpen}>
        <RT.Trigger
          asChild
          onPointerDown={(e) => {
            pointerType.current = e.pointerType;
          }}
          onClick={() => {
            // Touch devices have no hover: a tap opens the bubble, a tap elsewhere closes it.
            if (pointerType.current === "touch") setOpen(true);
          }}
        >
          {children}
        </RT.Trigger>
        <RT.Portal>
          <RT.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              "z-[70] max-w-[min(320px,calc(100vw-24px))] rounded-lg bg-brand-950 px-2.5 py-1.5 text-[12.5px] font-medium leading-5 text-white shadow-pop",
              "data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-scale-in data-[state=instant-open]:animate-fade-in",
              className,
            )}
          >
            {content}
            <RT.Arrow className="fill-brand-950" width={10} height={5} />
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
