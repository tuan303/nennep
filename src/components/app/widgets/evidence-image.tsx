"use client";
import { ImageOff, RotateCcw } from "lucide-react";
import { Button, Skeleton, Spinner, cn } from "@/components/ui";
import { useEvidenceUrl, type EvidenceUrlState } from "./hooks";

interface ViewProps {
  state: EvidenceUrlState;
  alt: string;
  /** "cover" for square thumbnails, "contain" for the lightbox. */
  fit?: "cover" | "contain";
  /** Text under the error icon (e.g. "Chạm để thử lại" when the parent button retries). */
  errorHint?: string;
  className?: string;
}

/** Presentational evidence image for a given load state (no interactive content – safe inside a button). */
export function EvidenceImageView({ state, alt, fit = "cover", errorHint, className }: ViewProps) {
  if (state.status === "loading") {
    return <Skeleton className={cn("size-full rounded-none", className)} />;
  }
  if (state.status === "error") {
    return (
      <span role="img" aria-label={`${alt}: không tải được ảnh`} className={cn("flex size-full flex-col items-center justify-center gap-1 bg-surface-3 p-1 text-center text-slate-500", className)}>
        <ImageOff aria-hidden className="size-5" strokeWidth={2} />
        <span aria-hidden className="text-2xs leading-4">
          Không tải được ảnh
          {errorHint ? <span className="block font-semibold text-brand-700">{errorHint}</span> : null}
        </span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: URLs cannot go through next/image
    <img src={state.url} alt={alt} className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain", className)} draggable={false} />
  );
}

export interface EvidenceImageProps {
  id: string;
  /** Local preview (blob: URL) of a photo just uploaded – skips the network. */
  localUrl?: string;
  alt: string;
  fit?: "cover" | "contain";
  className?: string;
}

/** Evidence photo loaded with the user's token (api.evidence.objectUrl), with loading and retry states. */
export function EvidenceImage({ id, localUrl, alt, fit = "contain", className }: EvidenceImageProps) {
  const state = useEvidenceUrl(id, localUrl);
  if (state.status === "loading") {
    return (
      <span className={cn("flex size-full items-center justify-center", className)}>
        <Spinner size="lg" label="Đang tải ảnh" />
      </span>
    );
  }
  if (state.status !== "error") return <EvidenceImageView state={state} alt={alt} fit={fit} className={className} />;
  return (
    <span className={cn("flex size-full flex-col items-center justify-center gap-2", className)}>
      <EvidenceImageView state={state} alt={alt} className="h-auto bg-transparent" />
      <Button variant="secondary" size="sm" icon={RotateCcw} onClick={state.retry}>
        Thử lại
      </Button>
    </span>
  );
}
