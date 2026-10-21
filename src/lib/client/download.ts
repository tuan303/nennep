/**
 * "Save as" for generated files (Excel exports, HTML snapshots…) via a temporary <a download>. Browser only.
 */

export const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  html: "text/html;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  txt: "text/plain;charset=utf-8",
} as const;

export type DownloadData = Blob | ArrayBuffer | ArrayBufferView | string;

function toBlob(data: DownloadData, mime?: string): Blob {
  if (data instanceof Blob) return mime && data.type !== mime ? new Blob([data], { type: mime }) : data;
  const type = mime ?? (typeof data === "string" ? MIME.txt : "application/octet-stream");
  if (typeof data === "string") return new Blob([data], { type });
  if (data instanceof ArrayBuffer) return new Blob([data], { type });
  // Copy views (e.g. Node Buffer / Uint8Array over a shared buffer) into a fresh ArrayBuffer.
  const copy = new Uint8Array(data.byteLength);
  copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return new Blob([copy], { type });
}

/** Strip characters that are invalid in file names on Windows/macOS; keep Vietnamese letters. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || "tai-xuong";
}

export function downloadBlob(data: DownloadData, fileName: string, mime?: string): void {
  if (typeof document === "undefined") throw new Error("downloadBlob() is browser-only.");
  const blob = toBlob(data, mime);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
