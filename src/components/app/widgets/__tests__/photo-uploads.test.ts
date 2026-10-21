import { describe, expect, it } from "vitest";
import { SerialQueue, photoSaveBlocker, summarizePhotoUploads } from "../lib/photo-uploads";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SerialQueue (PhotoCapture uploads)", () => {
  it("ignores repeated retries of a photo that is already waiting behind another upload", async () => {
    const q = new SerialQueue();
    const uploads: string[] = [];
    const first = deferred();
    q.enqueue("u1", async () => {
      uploads.push("u1");
      await first.promise; // a slow upload on school Wi-Fi
    });
    // "Thử lại" on the failed photo u2, tapped three times because nothing seemed to happen.
    expect(q.enqueue("u2", async () => void uploads.push("u2"))).toBe(true);
    expect(q.enqueue("u2", async () => void uploads.push("u2"))).toBe(false);
    expect(q.enqueue("u2", async () => void uploads.push("u2"))).toBe(false);
    expect(q.has("u2")).toBe(true);
    first.resolve();
    await q.idle();
    expect(uploads).toEqual(["u1", "u2"]);
    expect(q.has("u2")).toBe(false);
  });

  it("runs jobs one at a time in order and survives a failing job; a failed key can be retried later", async () => {
    const q = new SerialQueue();
    const log: string[] = [];
    const failing = deferred();
    q.enqueue("a", async () => {
      log.push("a:start");
      await failing.promise;
      log.push("a:end");
    });
    q.enqueue("b", async () => void log.push("b"));
    failing.reject(new Error("network"));
    await q.idle();
    expect(log).toEqual(["a:start", "b"]);
    expect(q.enqueue("a", async () => void log.push("a:retry"))).toBe(true);
    await q.idle();
    expect(log).toEqual(["a:start", "b", "a:retry"]);
  });
});

describe("photo upload summary", () => {
  it("counts waiting/uploading and failed photos separately", () => {
    expect(summarizePhotoUploads([{ status: "queued" }, { status: "uploading" }, { status: "error" }])).toEqual({ inProgress: 2, failed: 1 });
    expect(summarizePhotoUploads([])).toEqual({ inProgress: 0, failed: 0 });
  });

  it("blocks saving while uploading and while a failed photo would be dropped", () => {
    expect(photoSaveBlocker({ inProgress: 1, failed: 1 })).toBe("Đang tải ảnh minh chứng lên…");
    expect(photoSaveBlocker({ inProgress: 0, failed: 1 })).toBe("1 ảnh tải lỗi – bấm “Thử lại” hoặc bỏ ảnh đó");
    expect(photoSaveBlocker({ inProgress: 0, failed: 0 })).toBeUndefined();
  });
});
