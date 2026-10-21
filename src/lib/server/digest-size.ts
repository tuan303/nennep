/** Guard against Firestore's 1 MiB document limit for digest documents. */
import { ApiError } from "./errors";

/** Digest docs must stay below this many bytes (JSON estimate; Firestore hard limit is 1 MiB). */
export const DIGEST_MAX_BYTES = 900_000;

export function estimateBytes(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

/** Throws a clear 500 when a digest would exceed DIGEST_MAX_BYTES (nothing is written). */
export function assertDigestSize(docId: string, data: unknown): void {
  const size = estimateBytes(data);
  if (size > DIGEST_MAX_BYTES) {
    throw new ApiError(
      500,
      "INTERNAL",
      `Dữ liệu tổng hợp "${docId}" vượt giới hạn ${Math.round(DIGEST_MAX_BYTES / 1000)} KB (${Math.round(size / 1000)} KB). ` +
        "Thao tác chưa được lưu. Vui lòng liên hệ quản trị để tách hoặc dọn dữ liệu.",
      { docId, bytes: size },
    );
  }
}
