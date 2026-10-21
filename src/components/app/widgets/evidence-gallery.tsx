"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Images, Link2, TriangleAlert } from "lucide-react";
import { Dialog, DialogClose, Button, IconButton, buttonClasses, cn } from "@/components/ui";
import { EvidenceImage, EvidenceImageView } from "./evidence-image";
import { useEvidenceUrl } from "./hooks";
import { displayUrl, safeExternalUrl } from "./lib/urls";

export interface EvidenceGalleryProps {
  /** Evidence photo ids (`incident.photoIds`). */
  photoIds: string[];
  /** Evidence links (`incident.evidenceUrls`). */
  urls: string[];
  /** Text when there is no evidence at all (null = render nothing). */
  emptyText?: string | null;
  className?: string;
}

/** Evidence photos as thumbnails (lightbox on tap) + evidence links. */
export function EvidenceGallery({ photoIds, urls, emptyText = "Chưa có minh chứng.", className }: EvidenceGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (photoIds.length === 0 && urls.length === 0) {
    return emptyText === null ? null : <p className={cn("text-sm text-slate-500", className)}>{emptyText}</p>;
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {photoIds.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4">
          {photoIds.map((id, i) => (
            <li key={id}>
              <Thumb id={id} index={i} total={photoIds.length} onOpen={() => setOpenIndex(i)} />
            </li>
          ))}
        </ul>
      ) : null}
      {urls.length > 0 ? <LinkList urls={urls} /> : null}
      <Lightbox photoIds={photoIds} index={openIndex} onIndexChange={setOpenIndex} />
    </div>
  );
}

function Thumb({ id, index, total, onOpen }: { id: string; index: number; total: number; onOpen: () => void }) {
  const state = useEvidenceUrl(id);
  const label = `Ảnh minh chứng ${index + 1}/${total}`;
  return (
    <button
      type="button"
      onClick={state.status === "error" ? state.retry : onOpen}
      aria-label={state.status === "error" ? `${label}: không tải được, bấm để thử lại` : `Xem ${label.toLowerCase()}`}
      className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-surface-3 ring-1 ring-inset ring-border transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <EvidenceImageView state={state} alt={label} errorHint="Chạm để thử lại" className="transition-transform duration-300 ease-soft group-hover:scale-[1.03]" />
    </button>
  );
}

function LinkList({ urls }: { urls: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {urls.map((raw, i) => {
        const href = safeExternalUrl(raw);
        return (
          <li key={`${i}-${raw}`} className="min-w-0">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <Link2 aria-hidden className="size-4 shrink-0 text-brand-500" strokeWidth={2.25} />
                <span className="min-w-0 flex-1 truncate">{displayUrl(raw)}</span>
                <ExternalLink aria-hidden className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" strokeWidth={2.25} />
                <span className="sr-only">(mở trong thẻ mới)</span>
              </a>
            ) : (
              <span className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-slate-500" title={raw}>
                <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn" strokeWidth={2.25} />
                <span className="min-w-0 flex-1 truncate">{displayUrl(raw)}</span>
                <span className="shrink-0 text-2xs">Liên kết không hợp lệ</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Lightbox({ photoIds, index, onIndexChange }: { photoIds: string[]; index: number | null; onIndexChange: (i: number | null) => void }) {
  const n = photoIds.length;
  const i = index ?? 0;
  const go = (delta: number) => onIndexChange((i + delta + n) % n);

  // ← / → switch photos while the lightbox is open (wherever the focus is inside the dialog).
  useEffect(() => {
    if (index === null || n < 2) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      onIndexChange((index + (e.key === "ArrowRight" ? 1 : -1) + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, n, onIndexChange]);
  const id = photoIds[i];
  return (
    <Dialog
      open={index !== null && n > 0}
      onOpenChange={(v) => !v && onIndexChange(null)}
      title={`Ảnh minh chứng ${i + 1}/${n}`}
      icon={Images}
      size="xl"
      bodyClassName="px-2 pb-2 sm:px-3"
      footer={
        <>
          {id ? <OpenOriginal id={id} /> : null}
          <DialogClose asChild>
            <Button variant="secondary">Đóng</Button>
          </DialogClose>
        </>
      }
    >
      <div className="relative flex h-[min(70dvh,640px)] items-center justify-center overflow-hidden rounded-xl bg-brand-950/95">
        {id ? <EvidenceImage key={id} id={id} alt={`Ảnh minh chứng ${i + 1}/${n}`} fit="contain" className="text-slate-300" /> : null}
        {n > 1 ? (
          <>
            <IconButton
              icon={ChevronLeft}
              label="Ảnh trước"
              variant="secondary"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 shadow-raised"
            />
            <IconButton
              icon={ChevronRight}
              label="Ảnh sau"
              variant="secondary"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 shadow-raised"
            />
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

/** "Mở ảnh gốc" – opens the cached blob URL in a new tab once it is loaded. */
function OpenOriginal({ id }: { id: string }) {
  const state = useEvidenceUrl(id);
  if (state.status !== "ready") return null;
  return (
    <a href={state.url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "ghost" })}>
      <ExternalLink aria-hidden className="size-[18px]" strokeWidth={2.25} />
      Mở ảnh gốc
    </a>
  );
}
