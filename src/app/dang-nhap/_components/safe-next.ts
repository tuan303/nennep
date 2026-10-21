/**
 * Sanitise the `?next=` return path of the login page: only same-origin app paths are allowed
 * (no protocol-relative "//host", no backslashes, no control characters, never the login page or the API).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(v)) return "/";
  let url: URL;
  try {
    url = new URL(v, "http://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "http://app.local") return "/";
  const path = url.pathname;
  if (path === "/dang-nhap" || path.startsWith("/dang-nhap/") || path === "/api" || path.startsWith("/api/")) return "/";
  return `${path}${url.search}${url.hash}`;
}
