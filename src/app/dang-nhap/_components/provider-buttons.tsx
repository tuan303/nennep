"use client";
import type { ReactNode } from "react";
import { Spinner, cn } from "@/components/ui";
import type { AuthProviderId } from "@/lib/client/session";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-[18px]">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden className="size-4">
      <path fill="#F25022" d="M1 1h9v9H1z" />
      <path fill="#7FBA00" d="M11 1h9v9h-9z" />
      <path fill="#00A4EF" d="M1 11h9v9H1z" />
      <path fill="#FFB900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

const LOGOS: Record<AuthProviderId, ReactNode> = { google: <GoogleLogo />, microsoft: <MicrosoftLogo /> };
const LABELS: Record<AuthProviderId, string> = { google: "Google", microsoft: "Microsoft" };

export interface ProviderButtonsProps {
  providers: AuthProviderId[];
  busy: AuthProviderId | null;
  disabled?: boolean;
  onSelect: (provider: AuthProviderId) => void;
}

/** Optional "Đăng nhập với Google / Microsoft" buttons (enabled by NEXT_PUBLIC_AUTH_GOOGLE / _MICROSOFT). */
export function ProviderButtons({ providers, busy, disabled, onSelect }: ProviderButtonsProps) {
  if (providers.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-xs font-medium text-slate-500" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        hoặc đăng nhập bằng
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className={cn("mt-4 grid gap-2", providers.length > 1 && "sm:grid-cols-2")}>
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            disabled={disabled || busy !== null}
            aria-busy={busy === p || undefined}
            className="inline-flex h-11 items-center justify-center gap-2.5 rounded-control bg-surface px-4 text-sm font-semibold text-slate-800 shadow-xs ring-1 ring-inset ring-border-strong transition-colors hover:bg-surface-2 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-60"
          >
            {busy === p ? <Spinner size="sm" label="" /> : LOGOS[p]}
            <span>
              <span className="sr-only">Đăng nhập với </span>
              {LABELS[p]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
