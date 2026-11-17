import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

/**
 * Routes that may render a report PDF with headless Chromium (src/lib/server/mail/pdf.ts). @sparticuz/chromium reads
 * its compressed browser from node_modules/@sparticuz/chromium/bin at run time, which file tracing cannot see.
 * Keys are picomatch globs that match anywhere in the route ("*" stands for a dynamic segment such as [id]), so
 * "/api/reports/mail" also matches /api/reports/mail/recipients – excluded again below (it never renders a PDF).
 *
 * Every route listed here must export `maxDuration = 300`, and no other route may use 300: Vercel bundles routes with
 * an identical function configuration into one function and merges their traced files, so a non-PDF route sharing a
 * value with a PDF route would ship the ~70 MB Chromium too (checked by src/lib/server/__tests__/mail-deadlines.test.ts).
 */
const PDF_ROUTES = ["/api/reports/mail", "/api/reports/pdf", "/api/mail/batches/*", "/api/mail/jobs/*/retry", "/api/cron/mail"];
const CHROMIUM_FILES = ["./node_modules/@sparticuz/chromium/bin/**"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "puppeteer-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: Object.fromEntries(PDF_ROUTES.map((route) => [route, CHROMIUM_FILES])),
  outputFileTracingExcludes: { "/api/reports/mail/recipients": CHROMIUM_FILES },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
