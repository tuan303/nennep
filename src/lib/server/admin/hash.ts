/**
 * Deterministic hashing for import previews (BR-IMP-01): the preview returns `previewHash`, the commit
 * recomputes it from the same request + current data and rejects the commit when it differs.
 */
import { createHash } from "node:crypto";

/** JSON with object keys sorted recursively (undefined values dropped, like JSON.stringify). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortDeep(v)));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** sha256 of the canonical JSON of `value`. */
export function hashOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export const PREVIEW_CHANGED_MESSAGE = "Dữ liệu đã thay đổi, vui lòng xem trước lại";
