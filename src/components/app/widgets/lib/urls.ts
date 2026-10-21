/** Evidence links (pure – unit-tested). Only http(s) links are ever rendered as clickable. */

/** Normalised href for an http(s) URL; undefined for anything else (javascript:, data:, malformed…). */
export function safeExternalUrl(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Short readable form: "drive.google.com/file/d/…" (host without "www." + path, ≤ `max` chars). */
export function displayUrl(raw: string, max = 56): string {
  const href = safeExternalUrl(raw);
  let text = raw.trim();
  if (href) {
    const u = new URL(href);
    const path = `${u.pathname}${u.search}`.replace(/\/$/, "");
    text = `${u.hostname.replace(/^www\./, "")}${path}`;
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
