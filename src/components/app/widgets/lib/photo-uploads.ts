/** Upload bookkeeping of PhotoCapture (framework-free – unit-tested). */

/**
 * Runs jobs one at a time, in order, with at most one queued-or-running job per key: a second tap on "Thử lại"
 * while the photo already waits behind other uploads is ignored instead of uploading the same file twice.
 * A failing job never breaks the chain.
 */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();
  private readonly active = new Set<string>();

  /** Queue `job` under `key`; false (ignored) when a job for that key is already queued or running. */
  enqueue(key: string, job: () => Promise<void>): boolean {
    if (this.active.has(key)) return false;
    this.active.add(key);
    this.tail = this.tail.then(async () => {
      try {
        await job();
      } catch {
        // The job reports its own failure; keep the chain alive.
      } finally {
        this.active.delete(key);
      }
    });
    return true;
  }

  /** A job for `key` is queued or running. */
  has(key: string): boolean {
    return this.active.has(key);
  }

  /** Settles when every job queued so far has finished. */
  idle(): Promise<void> {
    return this.tail;
  }
}

export type PhotoUploadStatus = "queued" | "uploading" | "error";

export interface PhotoUploadSummary {
  /** Waiting or uploading photos – saving must wait. */
  inProgress: number;
  /** Photos whose upload failed: they are NOT part of the record until retried (or removed). */
  failed: number;
}

export function summarizePhotoUploads(items: ReadonlyArray<{ status: PhotoUploadStatus }>): PhotoUploadSummary {
  let inProgress = 0;
  let failed = 0;
  for (const i of items) {
    if (i.status === "error") failed++;
    else inProgress++;
  }
  return { inProgress, failed };
}

/**
 * Why a form with evidence photos cannot be saved yet (undefined = nothing blocks): photos still uploading, or
 * failed uploads that would otherwise be dropped silently when the record is saved.
 */
export function photoSaveBlocker(summary: PhotoUploadSummary): string | undefined {
  if (summary.inProgress > 0) return "Đang tải ảnh minh chứng lên…";
  if (summary.failed > 0) return `${summary.failed} ảnh tải lỗi – bấm “Thử lại” hoặc bỏ ảnh đó`;
  return undefined;
}
