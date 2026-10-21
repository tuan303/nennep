"use client";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { ManualCopyHost } from "@/components/app/widgets/manual-copy";
import { Toaster } from "@/components/ui/toaster";
import { DataProvider } from "@/lib/client/data";
import { SessionProvider } from "@/lib/client/session";

/** App-wide client providers (root layout): session → datasets → tooltips, plus the toast and manual-copy hosts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <DataProvider>
        <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={200}>
          {children}
          <Toaster />
          <ManualCopyHost />
        </TooltipPrimitive.Provider>
      </DataProvider>
    </SessionProvider>
  );
}
