"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, RotateCcw, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Spinner, cn, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import type { LevelId } from "@/lib/types";
import { EvidenceImageView } from "./evidence-image";
import { useEvidenceUrl } from "./hooks";
import { SerialQueue, summarizePhotoUploads, type PhotoUploadStatus, type PhotoUploadSummary } from "./lib/photo-uploads";

/** Contract limit of photos per record. */
const CONTRACT_MAX = 5;

export interface PhotoCaptureProps {
  levelId: LevelId;
  /** Uploaded evidence ids (`photoIds`). */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Maximum number of photos (default 5, the API limit). */
  max?: number;
  disabled?: boolean;
  /** true while at least one photo is waiting/being compressed/uploaded (disable "Lưu" meanwhile). */
  onBusyChange?: (busy: boolean) => void;
  /**
   * Photos still uploading and photos whose upload FAILED. A failed photo is not in `value`: block saving (or
   * confirm) while `failed > 0`, otherwise it is dropped silently – see `photoSaveBlocker`.
   */
  onUploadsChange?: (summary: PhotoUploadSummary) => void;
  className?: string;
}

interface PendingUpload {
  key: string;
  file: File;
  preview: string;
  /** "queued" = waiting behind other uploads (one photo at a time). */
  status: PhotoUploadStatus;
  error?: string;
}

let seq = 0;

/**
 * Evidence photos for incident/reward forms: camera (phones) or library, client-side compression + upload
 * (api.evidence.upload, one photo at a time), thumbnails with remove, retry on failure, max 5.
 * Failed photos stay as red tiles (with "Thử lại" / remove) and are reported through `onUploadsChange`.
 */
export function PhotoCapture({ levelId, value, onChange, max = CONTRACT_MAX, disabled, onBusyChange, onUploadsChange, className }: PhotoCaptureProps) {
  const limit = Math.min(Math.max(1, max), CONTRACT_MAX);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const [queue] = useState(() => new SerialQueue());
  const alive = useRef(true);
  const previews = useRef(new Map<string, string>()); // evidence id → local blob: preview
  const ownedUrls = useRef(new Set<string>());

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    alive.current = true;
    const urls = ownedUrls.current;
    return () => {
      alive.current = false; // photos still waiting in the queue are not uploaded for a form that is gone
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    };
  }, []);

  const { inProgress, failed } = summarizePhotoUploads(pending);
  const busy = inProgress > 0;
  const onBusyRef = useRef(onBusyChange);
  const onUploadsRef = useRef(onUploadsChange);
  useEffect(() => {
    onBusyRef.current = onBusyChange;
    onUploadsRef.current = onUploadsChange;
  });
  useEffect(() => {
    onBusyRef.current?.(busy);
  }, [busy]);
  useEffect(() => {
    onUploadsRef.current?.({ inProgress, failed });
  }, [inProgress, failed]);

  const remaining = limit - value.length - pending.length;

  function upload(item: PendingUpload) {
    const accepted = queue.enqueue(item.key, async () => {
      if (!alive.current) return;
      setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: "uploading", error: undefined } : p)));
      try {
        const id = await api.evidence.upload(levelId, item.file);
        if (!alive.current) return;
        previews.current.set(id, item.preview);
        const next = [...valueRef.current.filter((x) => x !== id), id];
        valueRef.current = next;
        onChange(next);
        setPending((list) => list.filter((p) => p.key !== item.key));
      } catch (err) {
        if (!alive.current) return;
        const message = errorMessage(err, "Chưa tải được ảnh lên. Vui lòng thử lại.");
        toast.error(message);
        setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: "error", error: message } : p)));
      }
    });
    // Already waiting or uploading (e.g. "Thử lại" tapped twice): never upload the same photo twice.
    if (!accepted) return;
    // Hide "Thử lại" right away, even while other photos are still ahead in the queue.
    setPending((list) => list.map((p) => (p.key === item.key && p.status === "error" ? { ...p, status: "queued", error: undefined } : p)));
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow choosing the same file again
    if (files.length === 0) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length < files.length) toast.error("Chỉ nhận tệp ảnh (JPEG, PNG hoặc WebP).");
    const accepted = images.slice(0, Math.max(0, remaining));
    if (images.length > accepted.length) {
      toast.warning(`Mỗi sự việc tối đa ${limit} ảnh – đã bỏ qua ${images.length - accepted.length} ảnh.`);
    }
    const items: PendingUpload[] = accepted.map((file) => {
      const preview = URL.createObjectURL(file);
      ownedUrls.current.add(preview);
      return { key: `u${++seq}`, file, preview, status: "queued" };
    });
    if (items.length === 0) return;
    setPending((list) => [...list, ...items]);
    items.forEach(upload);
  }

  function discard(item: PendingUpload) {
    if (queue.has(item.key)) return; // a retry is already on its way
    setPending((list) => list.filter((p) => p.key !== item.key));
    URL.revokeObjectURL(item.preview);
    ownedUrls.current.delete(item.preview);
  }

  function removeId(id: string) {
    const next = valueRef.current.filter((x) => x !== id);
    valueRef.current = next;
    onChange(next);
  }

  const canAdd = !disabled && remaining > 0;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <ul className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-5">
        {value.map((id, i) => (
          <li key={id}>
            <UploadedThumb id={id} localUrl={previews.current.get(id)} label={`Ảnh ${i + 1}`} onRemove={() => removeId(id)} disabled={disabled} />
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key}>
            <PendingThumb item={p} onRetry={() => upload(p)} onDiscard={() => discard(p)} />
          </li>
        ))}
        {canAdd ? (
          <>
            <li className="hidden pointer-coarse:block">
              <AddTile icon={Camera} label="Chụp ảnh" onClick={() => cameraRef.current?.click()} />
            </li>
            <li>
              <AddTile icon={ImagePlus} label="Chọn ảnh" onClick={() => libraryRef.current?.click()} />
            </li>
          </>
        ) : null}
      </ul>

      <p className="num flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500" aria-live="polite">
        <span>
          {inProgress > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-brand-700">
              <Spinner size="xs" label="" />
              Đang nén và tải {inProgress} ảnh lên…
            </span>
          ) : failed > 0 ? (
            <span className="inline-flex items-start gap-1.5 font-medium text-bad-strong">
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.5} />
              {failed} ảnh chưa tải lên được – bấm “Thử lại” hoặc bỏ ảnh đó. Ảnh lỗi sẽ không được lưu kèm bản ghi.
            </span>
          ) : (
            "Ảnh được nén tự động trước khi tải lên."
          )}
        </span>
        <span className="font-semibold text-slate-600">
          {value.length}/{limit} ảnh
        </span>
      </p>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={onFiles} disabled={!canAdd} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={onFiles} disabled={!canAdd} />
    </div>
  );
}

function AddTile({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-brand-300 bg-brand-50/50 text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:bg-brand-100"
    >
      <Icon aria-hidden className="size-6" strokeWidth={2} />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

const removeBtn =
  "absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-full bg-brand-950/70 text-white backdrop-blur-sm transition hover:bg-bad focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white pointer-coarse:size-8";

function UploadedThumb({ id, localUrl, label, onRemove, disabled }: { id: string; localUrl?: string; label: string; onRemove: () => void; disabled?: boolean }) {
  const state = useEvidenceUrl(id, localUrl);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-3 ring-1 ring-inset ring-border">
      <EvidenceImageView state={state} alt={label} />
      {!disabled ? (
        <button type="button" onClick={onRemove} aria-label={`Bỏ ${label.toLowerCase()}`} className={removeBtn}>
          <X aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

function PendingThumb({ item, onRetry, onDiscard }: { item: PendingUpload; onRetry: () => void; onDiscard: () => void }) {
  const failed = item.status === "error";
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-3 ring-1 ring-inset ring-border">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview */}
      <img src={item.preview} alt="" className={cn("size-full object-cover", failed ? "opacity-40 grayscale" : "opacity-60")} />
      <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-1 p-1 text-center", failed ? "bg-bad-soft/70" : "bg-brand-950/25")}>
        {failed ? (
          <>
            <TriangleAlert aria-hidden className="size-5 text-bad-strong" strokeWidth={2.25} />
            <button
              type="button"
              onClick={onRetry}
              title={item.error}
              className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-2xs font-semibold text-bad-strong shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <RotateCcw aria-hidden className="size-3" strokeWidth={2.5} />
              Thử lại
            </button>
            <span className="sr-only">{item.error}</span>
          </>
        ) : (
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-brand-600 shadow-sm">
            <Spinner size="sm" label={item.status === "queued" ? "Đang chờ tải lên" : "Đang tải ảnh lên"} />
          </span>
        )}
      </div>
      {failed ? (
        <button type="button" onClick={onDiscard} aria-label="Bỏ ảnh tải lỗi" className={removeBtn}>
          <X aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
