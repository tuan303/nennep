/**
 * Evidence photos (browser only): client-side compression → data URL → POST /api/evidence,
 * and authenticated object URLs for display (GET /api/evidence/:id needs the Bearer token, so <img src>
 * cannot point at the API directly).
 */
import type { EvidenceUploadInput } from "@/lib/contract";
import type { LevelId } from "@/lib/types";
import { ApiClientError } from "./api-errors";
import { requestBlob, requestJson, seg } from "./http";

/** Server limit for the decoded image (contract: ≤ 700 KB). Keep a small safety margin. */
const MAX_UPLOAD_BYTES = 690 * 1024;
const ACCEPTED_INPUT = /^image\//;

interface CompressionPass {
  maxWidthOrHeight: number;
  maxSizeMB: number;
  initialQuality: number;
}

/**
 * Evidence photos are stored in Firestore: ≈200 KB at 1280 px keeps a sign or a uniform readable while the storage of
 * a school year stays small (INTEGRITY-12). The second pass only runs when the first result is still above the
 * server limit.
 */
const PASSES: CompressionPass[] = [
  { maxWidthOrHeight: 1280, maxSizeMB: 0.2, initialQuality: 0.8 },
  { maxWidthOrHeight: 1024, maxSizeMB: 0.15, initialQuality: 0.7 },
];

function invalidImage(message: string): ApiClientError {
  return new ApiClientError(400, "VALIDATION", message);
}

/** Compress to JPEG (or WebP when the source is WebP), max 1280 px, ≈200 KB; second, stronger pass if needed. */
export async function compressImage(file: File): Promise<File> {
  if (!ACCEPTED_INPUT.test(file.type)) throw invalidImage("Chỉ nhận tệp ảnh (JPEG, PNG hoặc WebP).");
  const { default: imageCompression } = await import("browser-image-compression");
  const fileType = file.type === "image/webp" ? "image/webp" : "image/jpeg";
  let out: File = file;
  for (const pass of PASSES) {
    try {
      // useWebWorker:false – the worker mode would download the library from a public CDN at runtime.
      out = await imageCompression(file, { ...pass, fileType, useWebWorker: false, maxIteration: 12 });
    } catch {
      throw invalidImage("Không đọc được ảnh này. Vui lòng chọn ảnh JPEG, PNG hoặc WebP khác.");
    }
    if (out.size <= MAX_UPLOAD_BYTES) return out;
  }
  throw invalidImage("Ảnh quá lớn sau khi nén. Vui lòng chọn ảnh khác hoặc chụp lại với độ phân giải thấp hơn.");
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unexpected FileReader result")));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** Compress + upload one photo; resolves with the evidence id to put in `photoIds`. */
export async function uploadEvidence(levelId: LevelId, file: File): Promise<string> {
  const compressed = await compressImage(file);
  let dataUrl: string;
  try {
    dataUrl = await blobToDataUrl(compressed);
  } catch {
    throw invalidImage("Không đọc được ảnh này. Vui lòng thử ảnh khác.");
  }
  const body: EvidenceUploadInput = { levelId, dataUrl, fileName: file.name.slice(0, 200) || undefined };
  const res = await requestJson<{ id: string }>("/api/evidence", { method: "POST", body });
  return res.id;
}

const urlPromises = new Map<string, Promise<string>>();
const resolvedUrls = new Map<string, string>();

/** Object URL for an evidence image (fetched once per id with auth, then cached until `clearEvidenceCache`). */
export function evidenceObjectUrl(id: string): Promise<string> {
  const cached = urlPromises.get(id);
  if (cached) return cached;
  const p = requestBlob(`/api/evidence/${seg(id)}`, { headers: { Accept: "image/*" } }).then(
    (blob) => {
      const url = URL.createObjectURL(blob);
      resolvedUrls.set(id, url);
      return url;
    },
    (err: unknown) => {
      urlPromises.delete(id);
      throw err;
    },
  );
  urlPromises.set(id, p);
  return p;
}

/** Revoke cached object URLs (one id, or all – e.g. on logout). */
export function clearEvidenceCache(id?: string): void {
  const ids = id === undefined ? [...resolvedUrls.keys()] : [id];
  for (const k of ids) {
    const url = resolvedUrls.get(k);
    if (url) URL.revokeObjectURL(url);
    resolvedUrls.delete(k);
    urlPromises.delete(k);
  }
  if (id === undefined) urlPromises.clear();
}
