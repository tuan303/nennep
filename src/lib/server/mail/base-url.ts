/**
 * Base URL of the app for links in emails and for the headless print of report PDFs (no trailing slash):
 * APP_BASE_URL → https://${VERCEL_PROJECT_PRODUCTION_URL} → the request origin → http://localhost:3000.
 * Values that are not http(s) URLs are skipped.
 */

export const FALLBACK_BASE_URL = "http://localhost:3000";

/** "https://app.example.edu.vn/" → "https://app.example.edu.vn"; a bare host gets "https://"; undefined when unusable. */
export function normalizeBaseUrl(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function appBaseUrl(reqOrigin?: string, env: NodeJS.ProcessEnv = process.env): string {
  return (
    normalizeBaseUrl(env.APP_BASE_URL) ??
    normalizeBaseUrl(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeBaseUrl(reqOrigin) ??
    FALLBACK_BASE_URL
  );
}
